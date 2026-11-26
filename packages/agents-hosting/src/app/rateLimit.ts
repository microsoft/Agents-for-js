/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { INVOKE_RESPONSE_KEY } from '../activityHandler'
import { InvokeResponse } from '../invoke'
import {
  MemoryStorageV2,
  Storage,
  StorageOperationStatus,
  StorageProvider,
  StorageV2,
  StorageWriteMode,
  StorageWriteOptions,
  StoreItem,
} from '../storage'
import {
  asStorageV2,
  assertStorageWriteSucceeded,
  getStorageReadValue,
  isStorageV2,
} from '../storage/storageCompatibility'
import { StatusCodes } from '../statusCodes'
import { TurnContext } from '../turnContext'

const logger = debug('agents:rate-limit')
const DEFAULT_THROTTLE_MESSAGE = 'Too many requests. Please try again later.'
const DEFAULT_MAX_STORAGE_RETRIES = 3

/**
 * Defines how a rate limit rule groups incoming activities by scope key.
 *
 * The scope is the identity of the counter to increment after the rule has been
 * selected for the turn. Use {@link RateLimitRule.appliesTo} to decide whether a
 * rule should participate; use `scope` to decide which user, conversation,
 * tenant, or other key should be counted.
 *
 * If a rule applies and the scope returns `undefined` or an empty string, the
 * turn is throttled. This avoids silently bypassing a limit when the scope key
 * cannot be derived.
 *
 * @example Per-user key:
 * ```ts
 * scope: (context) => context.activity.from?.id
 * ```
 *
 * @example Per-conversation key:
 * ```ts
 * scope: (context) => context.activity.conversation?.id
 * ```
 *
 * @example Per-user-per-conversation key:
 * ```ts
 * scope: (context) => `${context.activity.from?.id}:${context.activity.conversation?.id}`
 * ```
 *
 * @example Per-tenant key:
 * ```ts
 * scope: (context) => context.activity.channelData?.tenantId
 * ```
 */
export type RateLimitScope = (context: TurnContext) => string | undefined | Promise<string | undefined>

/**
 * Defines how the application behaves when rate limit storage cannot be read or written.
 */
export type RateLimitStorageErrorBehavior = 'throttle' | 'allow' | 'throw'

/**
 * Details about a rate limit decision.
 */
export interface RateLimitResult {
  /**
   * The index of the rule that produced the decision.
   */
  ruleIndex: number

  /**
   * The derived rate limit key.
   */
  key?: string

  /**
   * Approximate delay before another activity would be accepted.
   *
   * When the counter is full, this is the time remaining until the window
   * resets. A write conflict with quota still available reports zero.
   */
  retryAfterMs: number
}

/**
 * Creates a message to send when a turn is throttled.
 *
 * The `result.retryAfterMs` value can be used to tell the user when another
 * activity is expected to be accepted.
 *
 * @example
 * ```ts
 * message: (_context, result) => {
 *   const seconds = Math.ceil(result.retryAfterMs / 1000)
 *   return `Too many requests. Try again in ${seconds} seconds.`
 * }
 * ```
 */
export type RateLimitMessageFactory =
  (context: TurnContext, result: RateLimitResult) => string | Activity | Promise<string | Activity>

/**
 * Configures one rate limit rule for incoming turns.
 *
 * A rule first decides whether it applies to the turn, then derives a scope key,
 * then increments the fixed-window counter for that scope key.
 * Multiple rules can apply to the same turn; the first rule whose counter is at
 * the limit throttles the turn and prevents the route handler from running.
 *
 * The fixed window starts when the first matching activity for a scope key is
 * accepted. It does not start when the limit is reached. For example, with
 * `limit: 3` and `windowMs: 10_000`:
 *
 * - at 0s, the first matching activity is accepted and starts a window ending at 10s
 * - at 1s and 2s, the second and third matching activities are accepted
 * - at 3s, the fourth matching activity is throttled with `retryAfterMs` near 7000
 * - at 10s, the window has expired and the next accepted activity starts a new window
 *
 * @example Limit all activities per user:
 * ```ts
 * {
 *   scope: (context) => context.activity.from?.id,
 *   limit: 10,
 *   windowMs: 60_000
 * }
 * ```
 *
 * @example Limit only message activities per conversation:
 * ```ts
 * {
 *   scope: (context) => context.activity.conversation?.id,
 *   activityTypes: [ActivityTypes.Message],
 *   limit: 20,
 *   windowMs: 60_000
 * }
 * ```
 *
 * @example Limit only an expensive command per user:
 * ```ts
 * {
 *   appliesTo: (context) => context.activity.text?.startsWith('/expensive') === true,
 *   scope: (context) => context.activity.from?.id,
 *   limit: 3,
 *   windowMs: 60_000
 * }
 * ```
 */
export interface RateLimitRule {
  /**
   * Derives the scope key that will be counted when this rule applies.
   *
   * This property is required.
   *
   * This is for grouping, not filtering. Return the same key for activities that
   * should share a quota, such as a user ID for per-user limits or a
   * conversation ID for per-conversation limits.
   *
   * If this rule applies and the returned key is missing or blank, the turn is
   * throttled instead of being allowed through without a counter.
   */
  scope: RateLimitScope

  /**
   * Maximum number of activities allowed for each scope key over `windowMs`.
   *
   * This property is required.
   *
   * Each accepted turn that matches the rule increments the counter for its
   * scope key. If a later rule rejects the turn, the limiter attempts to undo
   * any earlier increments. Storage failures can prevent that cleanup.
   */
  limit: number

  /**
   * Time window, in milliseconds, used for the rule's fixed-window counter.
   *
   * This property is required.
   *
   * For example, `limit: 5` and `windowMs: 60_000` allows up to five activities
   * per minute for each scope key. The window starts when the first matching
   * activity for the scope key is accepted, and resets after `windowMs`. If the
   * counter reaches `limit` before the window resets, additional matching
   * activities are throttled and `retryAfterMs` reports the remaining time in
   * that same window.
   */
  windowMs: number

  /**
   * Activity types counted by this rule.
   *
   * When provided, the rule only applies to activities whose type is in this
   * array.
   *
   * When omitted, the rule applies to all activity types, subject to `appliesTo`
   * if that predicate is also configured.
   *
   * @example
   * ```ts
   * activityTypes: [ActivityTypes.Message]
   * ```
   */
  activityTypes?: ActivityTypes[]

  /**
   * Optional predicate that decides whether this rule participates in the turn.
   *
   * When provided, it runs after the `activityTypes` check. If it returns
   * `true`, the rule continues to `scope` and may increment a counter. If it
   * returns `false`, the rule is skipped and no window state is read or written.
   *
   * When omitted, every activity that passed `activityTypes` is considered to
   * match this rule.
   *
   * Use this for policy or feature filtering, such as limiting only a command,
   * tenant, channel, or class of users.
   *
   * Keep this separate from `scope`: `appliesTo` answers "does this rule apply?",
   * while `scope` answers "which scope key should be counted?".
   *
   * @example
   * ```ts
   * appliesTo: (context) => context.activity.text?.startsWith('/expensive') === true
   * ```
   */
  appliesTo?: (context: TurnContext) => boolean | Promise<boolean>

  /**
   * Message sent when this rule throttles a turn.
   *
   * When provided, this message is used for throttled message turns. It can be a
   * plain string, an Activity, or a factory. Use a factory when the response
   * should include details such as `retryAfterMs`.
   *
   * When omitted, the default message is sent: "Too many requests. Please try
   * again later."
   */
  message?: string | Activity | RateLimitMessageFactory

  /**
   * Storage used for this rule's fixed-window state.
   *
   * When provided, the rule reads and writes window state through this storage
   * provider.
   *
   * When omitted, the rule uses the `AgentApplication` storage. If the
   * application does not have storage configured, the limiter falls back to
   * app-local memory storage. Use durable storage when limits must survive
   * restarts. Limits shared across application instances require a shared
   * {@link StorageV2} provider with conditional writes.
   */
  storage?: StorageProvider

  /**
   * Behavior when rate limit storage fails. Defaults to `throttle`.
   *
   * When provided, the selected behavior is used when storage cannot be read or
   * written. `throttle` fails closed and rejects the turn, `allow` fails open and
   * lets the turn continue, and `throw` surfaces the storage error.
   *
   * When omitted, storage failures use `throttle`.
      */
  storageErrorBehavior?: RateLimitStorageErrorBehavior

  /**
   * Number of times to retry storage operations. Defaults to 3.
   *
   * Read and write failures are retried up to this many times before applying
   * `storageErrorBehavior`. Conditional-write conflicts have a separate retry
   * budget for each rule. The limiter rereads the counter after a conflict,
   * even with zero retries, and throttles if it cannot record the turn within
   * the budget.
   */
  maxStorageRetries?: number
}

interface WindowState extends StoreItem {
  count: number
  resetAt: number
}

interface RateLimitDecision {
  allowed: boolean
  result?: RateLimitResult
  rule?: RateLimitRule
}

interface PendingRuleEvaluation {
  rule: RateLimitRule
  ruleIndex: number
  storage: StorageV2
  isNativeV2: boolean
  storageKey: string
  key: string
}

interface WindowWrite extends PendingRuleEvaluation {
  window: WindowState
  options?: StorageWriteOptions
}

export class AgentApplicationRateLimiter {
  private readonly fallbackStorage = new MemoryStorageV2()
  private readonly storageAdapters = new WeakMap<Storage, StorageV2>()
  private readonly storageIds = new WeakMap<StorageV2, number>()
  private readonly locks = new Map<string, Promise<void>>()
  private nextStorageId = 1

  /**
   * Creates a limiter for the configured rules, using application storage as
   * the shared fallback when a rule does not provide its own storage.
   */
  constructor (private readonly rules: RateLimitRule[], private readonly storage?: StorageProvider) {}

  /**
   * Evaluates every applicable rule and stages window writes. The turn is
   * allowed only when no rule is over its limit and all required writes succeed.
   */
  async shouldAllowTurn (context: TurnContext): Promise<RateLimitDecision> {
    const pendingEvaluations: PendingRuleEvaluation[] = []

    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i]
      if (!(await this.appliesToTurn(rule, context))) {
        continue
      }

      const key = await this.getScopeKey(rule, context)
      if (!key) {
        return {
          allowed: false,
          rule,
          result: { ruleIndex: i, retryAfterMs: rule.windowMs }
        }
      }

      try {
        pendingEvaluations.push(this.createPendingEvaluation(rule, i, key))
      } catch (err) {
        const decision = this.handleStorageError(rule, { ruleIndex: i, key, retryAfterMs: rule.windowMs }, err)
        if (!decision) {
          continue
        }
        return decision
      }
    }

    if (pendingEvaluations.length > 0) {
      return await this.withLocks(
        pendingEvaluations.map(pending => this.getLockKey(pending.storage, pending.storageKey)),
        async () => {
          const committed = new Map<string, WindowWrite>()
          let allowed = false
          try {
            const decision = await this.commitPendingEvaluations(pendingEvaluations, committed)
            allowed = decision === undefined
            return decision ?? { allowed: true }
          } finally {
            if (!allowed) {
              for (const write of committed.values()) {
                await this.releaseQuota(write)
              }
            }
          }
        }
      )
    }

    return { allowed: true }
  }

  /**
   * Reads and persists fixed-window state updates while holding key locks.
   *
   * Reads and writes within an instance are serialized by key. Conditional
   * writes on shared StorageV2 providers detect conflicts across instances.
   */
  private async commitPendingEvaluations (
    pendingEvaluations: PendingRuleEvaluation[],
    committed: Map<string, WindowWrite>
  ): Promise<RateLimitDecision | undefined> {
    let storageRetries = 0
    const writeConflicts = new Map<number, number>()

    while (true) {
      const writes: WindowWrite[] = []
      let retry = false

      for (const pending of pendingEvaluations) {
        if (committed.has(this.getLockKey(pending.storage, pending.storageKey))) {
          continue
        }

        const conflicts = writeConflicts.get(pending.ruleIndex)
        const maxRetries = pending.rule.maxStorageRetries ?? DEFAULT_MAX_STORAGE_RETRIES
        const canWrite = conflicts === undefined || conflicts <= maxRetries
        try {
          const { result, write } = await this.evaluateRule(pending, canWrite)
          if (result) {
            return { allowed: false, rule: pending.rule, result }
          }

          if (write) {
            writes.push(write)
          }
        } catch (err) {
          if (storageRetries >= maxRetries) {
            const decision = this.handleStorageError(pending.rule, {
              ruleIndex: pending.ruleIndex,
              key: pending.key,
              retryAfterMs: pending.rule.windowMs
            }, err)
            if (decision) {
              return decision
            }
            continue
          }

          storageRetries++
          retry = true
          break
        }
      }

      if (retry) {
        continue
      }

      for (const pending of writes) {
        try {
          const results = await pending.storage.write(
            { [pending.storageKey]: pending.window },
            pending.options
          )
          const status = results?.[pending.storageKey]?.status
          if (
            status === StorageOperationStatus.Conflict ||
            status === StorageOperationStatus.ConditionNotMet ||
            (status === StorageOperationStatus.NotFound && pending.options?.expectedVersion !== undefined)
          ) {
            const conflicts = writeConflicts.get(pending.ruleIndex) ?? 0
            writeConflicts.set(pending.ruleIndex, conflicts + 1)
            retry = true
            break
          }

          assertStorageWriteSucceeded(results, [pending.storageKey])
          committed.set(this.getLockKey(pending.storage, pending.storageKey), pending)
        } catch (err) {
          if (storageRetries >= (pending.rule.maxStorageRetries ?? DEFAULT_MAX_STORAGE_RETRIES)) {
            const decision = this.handleStorageError(pending.rule, {
              ruleIndex: pending.ruleIndex,
              key: pending.key,
              retryAfterMs: pending.rule.windowMs
            }, err)
            if (decision) {
              return decision
            }
            continue
          }

          storageRetries++
          retry = true
          break
        }
      }

      if (!retry) {
        return undefined
      }
    }
  }

  private async releaseQuota (write: WindowWrite): Promise<void> {
    const { rule, storage, storageKey, window, isNativeV2 } = write
    const maxRetries = rule.maxStorageRetries ?? DEFAULT_MAX_STORAGE_RETRIES

    try {
      for (let attempt = 0; ; attempt++) {
        const current = await this.readWindow(write)
        if (
          !current ||
          current.resetAt !== window.resetAt ||
          current.resetAt <= Date.now() ||
          current.count <= 0
        ) {
          return
        }

        const expectedVersion = current.eTag
        if (isNativeV2 && expectedVersion === undefined) {
          logger.warn('Cannot release rate limit quota without a storage version:', storageKey)
          return
        }

        const results = await storage.write(
          { [storageKey]: { ...current, count: current.count - 1 } },
          expectedVersion === undefined ? undefined : { expectedVersion }
        )
        const status = results[storageKey]?.status
        // Retry only when storage confirms the decrement did not take effect.
        if (status === StorageOperationStatus.ConditionNotMet && attempt < maxRetries) {
          continue
        }

        assertStorageWriteSucceeded(results, [storageKey])
        return
      }
    } catch (err) {
      logger.warn('Failed to release rate limit quota:', err)
    }
  }

  /**
   * Converts storage failures into the configured fail-open, fail-closed, or
   * throw behavior.
   */
  private handleStorageError (rule: RateLimitRule, result: RateLimitResult, err: unknown): RateLimitDecision | undefined {
    const behavior = rule.storageErrorBehavior ?? 'throttle'
    if (behavior === 'allow') {
      logger.warn('Rate limit storage failed; allowing turn:', err)
      return undefined
    }

    if (behavior === 'throw') {
      throw err
    }

    logger.warn('Rate limit storage failed; throttling turn:', err)
    return {
      allowed: false,
      rule,
      result
    }
  }

  /**
   * Sends the throttled response through the correct channel mechanism.
   */
  async handleThrottledTurn (context: TurnContext, rule: RateLimitRule, result: RateLimitResult): Promise<void> {
    const message = await this.resolveMessage(context, rule, result)
    if (context.activity.type === ActivityTypes.Invoke) {
      context.turnState.set(INVOKE_RESPONSE_KEY, {
        type: ActivityTypes.InvokeResponse,
        value: {
          status: StatusCodes.TOO_MANY_REQUESTS,
          body: { message: typeof message === 'string' ? message : message?.text ?? this.getDefaultMessage() }
        } as InvokeResponse
      })
      return
    }

    if (!message) {
      return
    }

    try {
      await context.sendActivity(message)
    } catch (err) {
      logger.warn('Failed to send rate limit message:', err)
    }
  }

  /**
   * Checks activity type and custom predicate filters before touching storage.
   */
  private async appliesToTurn (rule: RateLimitRule, context: TurnContext): Promise<boolean> {
    if (rule.activityTypes && !rule.activityTypes.some(t => t.toLocaleLowerCase() === context.activity.type?.toLocaleLowerCase())) {
      return false
    }

    if (rule.appliesTo && !(await rule.appliesTo(context))) {
      return false
    }

    return true
  }

  /**
   * Resolves and normalizes the storage key fragment for this rule and turn.
   */
  private async getScopeKey (rule: RateLimitRule, context: TurnContext): Promise<string | undefined> {
    const key = await rule.scope(context)
    return key?.trim() || undefined
  }

  /**
   * Reads the current window, decides whether the turn is over limit, and
   * prepares the next window state when the turn should be counted.
   */
  private async evaluateRule (
    pending: PendingRuleEvaluation,
    canWrite: boolean
  ): Promise<{ result?: RateLimitResult, write?: WindowWrite }> {
    const { rule, ruleIndex, key } = pending
    const current = await this.readWindow(pending)
    const now = Date.now()
    const window = this.getFixedWindow(rule, current, now)
    const atLimit = window.count >= rule.limit

    if (atLimit || !canWrite) {
      return {
        result: {
          ruleIndex,
          key,
          retryAfterMs: atLimit ? Math.max(0, window.resetAt - now) : 0
        }
      }
    }

    window.count++
    const expectedVersion = window.eTag
    const options = expectedVersion !== undefined
      ? { expectedVersion }
      : current === undefined && pending.isNativeV2
        ? { mode: StorageWriteMode.CreateOnly }
        : undefined

    return {
      write: { ...pending, window, options }
    }
  }

  private async readWindow (pending: PendingRuleEvaluation): Promise<WindowState | undefined> {
    const { storage, storageKey } = pending
    const items = await storage.read<WindowState>([storageKey])
    const value = getStorageReadValue(items, storageKey)

    return value === undefined ? undefined : { ...value, eTag: items[storageKey].version }
  }

  private createPendingEvaluation (rule: RateLimitRule, ruleIndex: number, key: string): PendingRuleEvaluation {
    const provider = rule.storage ?? this.storage ?? this.fallbackStorage
    const isNativeV2 = isStorageV2(provider)
    const storage = isNativeV2 ? provider : this.getStorageAdapter(provider)
    const storageKey = `rateLimit:${ruleIndex}:${key}`

    return { rule, ruleIndex, storage, isNativeV2, storageKey, key }
  }

  private getStorageAdapter (storage: Storage): StorageV2 {
    const existing = this.storageAdapters.get(storage)
    if (existing) {
      return existing
    }

    const adapter = asStorageV2(storage)
    this.storageAdapters.set(storage, adapter)
    return adapter
  }

  private async withLocks<T> (lockKeys: string[], action: () => Promise<T>): Promise<T> {
    const releases: Array<() => void> = []
    const uniqueLockKeys = [...new Set(lockKeys)].sort()

    for (const key of uniqueLockKeys) {
      releases.push(await this.acquireLock(key))
    }

    try {
      return await action()
    } finally {
      for (const release of releases.reverse()) {
        release()
      }
    }
  }

  private async acquireLock (key: string): Promise<() => void> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    let releaseCurrent!: () => void
    const current = new Promise<void>(resolve => {
      releaseCurrent = resolve
    })
    const next = previous.then(() => current)
    this.locks.set(key, next)

    await previous

    return () => {
      if (this.locks.get(key) === next) {
        this.locks.delete(key)
      }
      releaseCurrent()
    }
  }

  private getLockKey (storage: StorageV2, storageKey: string): string {
    return `${this.getStorageId(storage)}:${storageKey}`
  }

  private getStorageId (storage: StorageV2): number {
    const existing = this.storageIds.get(storage)
    if (existing) {
      return existing
    }

    const id = this.nextStorageId++
    this.storageIds.set(storage, id)
    return id
  }

  /**
   * Reuses the active window or starts a new one after the reset time.
   */
  private getFixedWindow (rule: RateLimitRule, current: WindowState | undefined, now: number): WindowState {
    if (!current || current.count === 0 || !Number.isFinite(current.resetAt) || current.resetAt <= now) {
      return {
        count: 0,
        resetAt: now + rule.windowMs,
        eTag: current?.eTag
      }
    }

    return { ...current }
  }

  /**
   * Resolves static and factory throttling messages to a sendable value.
   */
  private async resolveMessage (context: TurnContext, rule: RateLimitRule, result: RateLimitResult): Promise<string | Activity | undefined> {
    if (typeof rule.message === 'function') {
      return await rule.message(context, result)
    }

    return rule.message ?? this.getDefaultMessage()
  }

  /**
   * Returns the fallback throttling text when a rule does not provide one.
   */
  private getDefaultMessage (): string {
    return DEFAULT_THROTTLE_MESSAGE
  }
}
