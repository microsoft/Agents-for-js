// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Activity } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-activity/logger'
import type { ResourceResponse } from '../../connector-client'
import type { BaseAdapter } from '../../baseAdapter'
import type { TurnContext } from '../../turnContext'
import type { TurnState } from '../turnState'
import type { RouteHandler } from '../routeHandler'
import type { Storage } from '../../storage/storage'
import type { AgentApplication } from '../agentApplication'
import type { ProactiveOptions } from './proactiveOptions'
import type { CreateConversationOptions } from './createConversationOptions'
import { Conversation } from './conversation'

const logger = debug('agents:proactive')

const STORAGE_KEY_PREFIX = 'proactive/conversations/'

/** Options for `continueConversation()`. */
export interface ContinueConversationOptions {
  /** Auth connection names to acquire tokens for before invoking the handler. */
  autoSignInHandlers?: string[]
  /** Override the default continuation activity. */
  continuationActivity?: Partial<Activity>
}

/**
 * Proactive messaging subsystem. Exposed as `app.proactive`.
 *
 * Provides storage-backed conversation management and full-turn handling via
 * `continueConversation`, mirroring the C# `Proactive` class from PR #694.
 */
export class Proactive<TState extends TurnState> {
  /**
   * `activity.valueType` that indicates additional key/values for the ContinueConversation event.
   * Mirrors `Proactive.ContinueConversationValueType` in C#.
   */
  static readonly ContinueConversationValueType = 'application/vnd.microsoft.activity.continueconversation+json'

  private readonly _app: AgentApplication<TState>
  private readonly _options: ProactiveOptions
  private readonly _storage: Storage

  constructor (app: AgentApplication<TState>, options: ProactiveOptions) {
    this._app = app
    this._options = options

    if (options.storage) {
      this._storage = options.storage
    } else if (app.options.storage) {
      logger.warn(
        'proactive.storage was not configured; falling back to app.options.storage. ' +
        'Consider providing a dedicated storage for conversation references.'
      )
      this._storage = app.options.storage
    } else {
      throw new Error(
        'Proactive subsystem requires a storage backend. ' +
        'Set proactive.storage or app.options.storage.'
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Conversation reference storage
  // ---------------------------------------------------------------------------

  /**
   * Stores the conversation from a live `TurnContext` or an explicit
   * `Conversation` object.
   * @returns The conversation ID that can be used to retrieve it later.
   */
  storeConversation (context: TurnContext): Promise<string>
  storeConversation (conversation: Conversation): Promise<string>
  async storeConversation (contextOrConversation: TurnContext | Conversation): Promise<string> {
    const conv =
      contextOrConversation instanceof Conversation
        ? contextOrConversation
        : new Conversation(contextOrConversation as TurnContext)

    conv.validate()
    const id = conv.reference.conversation.id
    await this._storage.write({ [`${STORAGE_KEY_PREFIX}${id}`]: { reference: conv.reference, claims: conv.claims } })
    return id
  }

  /**
   * Retrieves a stored `Conversation` by ID.
   * Returns `undefined` if not found.
   */
  async getConversation (conversationId: string): Promise<Conversation | undefined> {
    const result = await this._storage.read([`${STORAGE_KEY_PREFIX}${conversationId}`])
    const stored = result[`${STORAGE_KEY_PREFIX}${conversationId}`] as { reference: any; claims: any } | undefined
    if (!stored) return undefined
    return new Conversation(stored.claims, stored.reference)
  }

  /**
   * Retrieves a stored `Conversation` by ID, or throws if not found.
   */
  async getConversationOrThrow (conversationId: string): Promise<Conversation> {
    const conv = await this.getConversation(conversationId)
    if (!conv) {
      throw new Error(`Conversation '${conversationId}' was not found in proactive storage.`)
    }
    return conv
  }

  /** Removes a stored conversation from storage. */
  async deleteConversation (conversationId: string): Promise<void> {
    await this._storage.delete([`${STORAGE_KEY_PREFIX}${conversationId}`])
  }

  // ---------------------------------------------------------------------------
  // Send activity (no state, no auth — just sends)
  // ---------------------------------------------------------------------------

  sendActivity (adapter: BaseAdapter, conversationId: string, activity: Partial<Activity>): Promise<ResourceResponse>
  sendActivity (adapter: BaseAdapter, conversation: Conversation, activity: Partial<Activity>): Promise<ResourceResponse>
  async sendActivity (
    adapter: BaseAdapter,
    conversationOrId: Conversation | string,
    activity: Partial<Activity>
  ): Promise<ResourceResponse> {
    const conv =
      typeof conversationOrId === 'string'
        ? await this.getConversationOrThrow(conversationOrId)
        : conversationOrId

    const activityToSend: Partial<Activity> = { type: 'message', ...activity }

    let response: ResourceResponse | undefined
    let caughtError: unknown

    await adapter.continueConversation(conv.identity, conv.reference, async (ctx: TurnContext) => {
      try {
        const result = await ctx.sendActivity(activityToSend as Activity)
        response = result as ResourceResponse
      } catch (err) {
        caughtError = err
      }
    })

    if (caughtError !== undefined) throw caughtError
    if (response === undefined) throw new Error('sendActivity: adapter did not return a ResourceResponse.')
    return response
  }

  // ---------------------------------------------------------------------------
  // Full-turn handler (loads TurnState, handles auth tokens)
  // ---------------------------------------------------------------------------

  continueConversation (adapter: BaseAdapter, conversationId: string, handler: RouteHandler<TState>, opts?: ContinueConversationOptions): Promise<void>
  continueConversation (adapter: BaseAdapter, conversation: Conversation, handler: RouteHandler<TState>, opts?: ContinueConversationOptions): Promise<void>
  async continueConversation (
    adapter: BaseAdapter,
    conversationOrId: Conversation | string,
    handler: RouteHandler<TState>,
    opts?: ContinueConversationOptions
  ): Promise<void> {
    const conv =
      typeof conversationOrId === 'string'
        ? await this.getConversationOrThrow(conversationOrId)
        : conversationOrId

    let caughtError: unknown

    await adapter.continueConversation(conv.identity, conv.reference, async (ctx: TurnContext) => {
      try {
        // Merge caller-supplied activity fields (e.g. value, valueType) into the
        // continuation activity so the handler can read request-time parameters.
        if (opts?.continuationActivity) {
          Object.assign(ctx.activity, opts.continuationActivity)
        }

        const state = this._app.options.turnStateFactory()
        await state.load(ctx, this._app.options.storage)

        // Token acquisition (optional — only when auth is configured)
        if (opts?.autoSignInHandlers?.length && this._app.hasUserAuthorization) {
          const results = await Promise.all(
            opts.autoSignInHandlers.map((handlerId) =>
              this._app.authorization.getToken(ctx, handlerId).catch(() => ({ token: undefined }))
            )
          )
          const allAcquired = results.every((r) => !!r.token)
          if (!allAcquired && this._options.failOnUnsignedInConnections !== false) {
            throw new Error('Not all token handlers have a signed-in user.')
          }
        }

        await handler(ctx, state)
        await state.save(ctx, this._app.options.storage)
      } catch (err) {
        caughtError = err
      } finally {
        if ((ctx as any).streamingResponse?.isStreamStarted?.()) {
          await (ctx as any).streamingResponse.endStream()
        }
      }
    })

    if (caughtError !== undefined) throw caughtError
  }

  // ---------------------------------------------------------------------------
  // Create new conversation
  // ---------------------------------------------------------------------------

  /**
   * Creates a new conversation via `adapter.createConversationAsync()`.
   * If `createOptions.storeConversation` is `true`, stores the resulting
   * `Conversation` automatically.
   *
   * @remarks
   * This wraps `adapter.createConversationAsync()` which requires real
   * network connectivity and auth. Integration test territory, not unit tested.
   */
  async createConversation (
    adapter: BaseAdapter,
    createOptions: CreateConversationOptions,
    handler?: RouteHandler<TState>
  ): Promise<Conversation> {
    if (!createOptions.parameters.members?.length) {
      throw new Error('createConversation: at least one member must be specified in parameters.members.')
    }

    // CloudAdapter.createConversationAsync(agentAppId, channelId, serviceUrl, audience, params, logic)
    // The logic callback IS the handler — context is created internally by the adapter.
    const cloudAdapter = adapter as any
    if (typeof cloudAdapter.createConversationAsync !== 'function') {
      throw new TypeError(
        'createConversation requires a CloudAdapter. The provided adapter does not implement createConversationAsync().'
      )
    }
    let capturedConv: Conversation | undefined

    await cloudAdapter.createConversationAsync(
      createOptions.identity.aud,
      createOptions.channelId,
      createOptions.serviceUrl,
      createOptions.scope,
      createOptions.parameters,
      async (ctx: TurnContext) => {
        const conv = new Conversation(createOptions.identity, ctx.activity.getConversationReference())
        capturedConv = conv

        if (createOptions.storeConversation) {
          await this.storeConversation(conv)
        }

        if (handler) {
          const state = this._app.options.turnStateFactory()
          await state.load(ctx, this._app.options.storage)
          await handler(ctx, state)
          await state.save(ctx, this._app.options.storage)
        }
      }
    )

    return capturedConv!
  }
}
