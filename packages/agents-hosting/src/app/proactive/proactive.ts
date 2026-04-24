// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Activity } from '@microsoft/agents-activity'
import type { ResourceResponse } from '../../connector-client'
import type { BaseAdapter } from '../../baseAdapter'
import type { TurnContext } from '../../turnContext'
import type { TurnState } from '../turnState'
import type { RouteHandler } from '../routeHandler'
import type { Storage } from '../../storage/storage'
import type { AgentApplication } from '../agentApplication'
import type { ProactiveOptions } from './proactiveOptions'
import type { CreateConversationOptions } from './createConversationOptions'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Conversation } from './conversation'
import { debug, trace } from '@microsoft/agents-telemetry'
import { Errors } from '../../errorHelper'
import { ProactiveTraceDefinitions } from '../../observability/traces'

const logger = debug('agents:proactive')
const STORAGE_KEY_PREFIX = 'proactive/conversations/'

/**
 * Provides methods for storing, retrieving, and managing conversation references to enable
 * proactive messaging scenarios. Supports sending activities and continuing conversations outside
 * the standard request/response flow using stored conversation references.
 *
 * @remarks
 * Use the `Proactive` class to implement scenarios where an agent needs to initiate conversations
 * or send messages to users without an incoming activity, such as notifications or scheduled alerts.
 * Some operations require that conversation references be stored using {@link storeConversation}
 * before they can be used.
 *
 * Access via `app.proactive` after configuring `proactive` in {@link AgentApplicationOptions}.
 */
export class Proactive<TState extends TurnState> {
  /**
   * `activity.valueType` that indicates additional key/values for the ContinueConversation event.
   */
  static readonly ContinueConversationValueType = 'application/vnd.microsoft.activity.continueconversation+json'

  private readonly _app: AgentApplication<TState>
  private readonly _options: ProactiveOptions
  private readonly _storage?: Storage

  constructor (app: AgentApplication<TState>, options: ProactiveOptions) {
    this._app = app
    this._options = options
    this._storage = options.storage
  }

  private requireStorage (): Storage {
    if (!this._storage) {
      throw ExceptionHelper.generateException(Error, Errors.ProactiveStorageRequired)
    }
    return this._storage
  }

  private requireAppStorage (): Storage {
    const storage = this._app.options.storage
    if (!storage) {
      throw ExceptionHelper.generateException(Error, Errors.ProactiveAppStorageRequired)
    }
    return storage
  }

  // ---------------------------------------------------------------------------
  // Conversation reference storage
  // ---------------------------------------------------------------------------

  /**
   * Stores the current conversation reference from a live {@link TurnContext} in proactive storage.
   *
   * @param context - The context object for the current turn, containing activity and conversation
   *   information.
   * @returns The conversation ID that can be used to retrieve the reference in future operations.
   * @example
   * ```typescript
   * // Inside an onMessage handler — save the conversation so we can message later
   * app.onActivity('message', async (ctx, state) => {
   *   const convId = await app.proactive.storeConversation(ctx)
   *   await ctx.sendActivity(`Conversation stored. ID: ${convId}`)
   * })
   * ```
   */
  storeConversation (context: TurnContext): Promise<string>
  /**
   * Stores an explicit {@link Conversation} object in proactive storage.
   *
   * @param conversation - The conversation reference record to store.
   * @returns The conversation ID that can be used to retrieve the reference in future operations.
   * @throws If the conversation fails validation (missing `conversation.id`, `serviceUrl`, or
   *   `claims.aud`).
   * @example
   * ```typescript
   * // Build a Conversation manually and store it
   * const conv = ConversationBuilder
   *   .create('my-app-id', 'msteams')
   *   .withUser('user-aad-id')
   *   .withConversationId('19:existing-thread-id@thread.tacv2')
   *   .build()
   * const convId = await app.proactive.storeConversation(conv)
   * ```
   */
  storeConversation (conversation: Conversation): Promise<string>
  async storeConversation (contextOrConversation: TurnContext | Conversation): Promise<string> {
    return trace(ProactiveTraceDefinitions.storeConversation, async ({ record }) => {
      const conv =
        contextOrConversation instanceof Conversation
          ? contextOrConversation
          : new Conversation(contextOrConversation as TurnContext)

      conv.validate()
      const id = conv.reference.conversation.id
      record({ conversationId: id })
      await this.requireStorage().write({ [`${STORAGE_KEY_PREFIX}${id}`]: { reference: conv.reference, claims: conv.claims } })
      return id
    })
  }

  /**
   * Retrieves the stored {@link Conversation} associated with the given conversation ID.
   *
   * @param conversationId - The unique identifier of the conversation to retrieve.
   * @returns The stored `Conversation`, or `undefined` if no record exists for that ID.
   * @example
   * ```typescript
   * const conv = await app.proactive.getConversation(convId)
   * if (conv) {
   *   await app.proactive.sendActivity(adapter, conv, { text: 'Hello!' })
   * }
   * ```
   */
  async getConversation (conversationId: string): Promise<Conversation | undefined> {
    return trace(ProactiveTraceDefinitions.getConversation, async ({ record }) => {
      record({ conversationId })
      const result = await this.requireStorage().read([`${STORAGE_KEY_PREFIX}${conversationId}`])
      const stored = result[`${STORAGE_KEY_PREFIX}${conversationId}`] as { reference: any; claims: any } | undefined
      if (!stored) {
        record({ found: false })
        return undefined
      }
      record({ found: true })
      return new Conversation(stored.claims, stored.reference)
    })
  }

  /**
   * Retrieves the stored {@link Conversation} for the given ID, throwing if no record is found.
   *
   * @param conversationId - The unique identifier of the conversation to retrieve.
   * @returns The stored `Conversation`.
   * @throws `Error` if no conversation reference is found for the specified ID.
   * @example
   * ```typescript
   * // Use when absence of the conversation should be treated as an error
   * const conv = await app.proactive.getConversationOrThrow(convId)
   * await app.proactive.sendActivity(adapter, conv, { text: 'Alert: your report is ready.' })
   * ```
   */
  async getConversationOrThrow (conversationId: string): Promise<Conversation> {
    return trace(ProactiveTraceDefinitions.getConversationOrThrow, async ({ record }) => {
      record({ conversationId })
      const conv = await this.getConversation(conversationId)
      if (!conv) {
        throw ExceptionHelper.generateException(Error, Errors.ProactiveConversationNotFound, undefined, { conversationId })
      }
      return conv
    })
  }

  /**
   * Deletes the stored conversation reference for the given conversation ID.
   *
   * @param conversationId - The unique identifier of the conversation whose reference should be
   *   deleted.
   * @remarks If no record exists for the given ID, no action is taken.
   * @example
   * ```typescript
   * // Clean up after a conversation has ended
   * app.onActivity('endOfConversation', async (ctx, state) => {
   *   await app.proactive.deleteConversation(ctx.activity.conversation.id)
   * })
   * ```
   */
  async deleteConversation (conversationId: string): Promise<void> {
    return trace(ProactiveTraceDefinitions.deleteConversation, async ({ record }) => {
      record({ conversationId })
      await this.requireStorage().delete([`${STORAGE_KEY_PREFIX}${conversationId}`])
    })
  }

  // ---------------------------------------------------------------------------
  // Send activity
  // ---------------------------------------------------------------------------

  /**
   * Sends an activity to a stored conversation, looking it up by ID.
   *
   * @param adapter - The channel adapter used to send the activity.
   * @param conversationId - The ID of a conversation previously stored via {@link storeConversation}.
   * @param activity - The activity to send. If `type` is not set it defaults to `'message'`.
   * @returns A {@link ResourceResponse} with the ID of the sent activity.
   * @throws `Error` if no conversation reference is found for the specified ID.
   * @example
   * ```typescript
   * // Send a notification using a previously stored conversation ID
   * await app.proactive.sendActivity(adapter, storedConvId, { text: 'Your order has shipped!' })
   * ```
   */
  sendActivity (adapter: BaseAdapter, conversationId: string, activity: Partial<Activity>): Promise<ResourceResponse>
  /**
   * Sends an activity to an existing conversation using the provided {@link Conversation} reference.
   *
   * @param adapter - The channel adapter used to send the activity.
   * @param conversation - A `Conversation` instance created via its constructor or
   *   {@link ConversationBuilder}.
   * @param activity - The activity to send. If `type` is not set it defaults to `'message'`.
   * @returns A {@link ResourceResponse} with the ID of the sent activity.
   * @example
   * ```typescript
   * // Build a Conversation from a stored reference and send a message
   * const conv = await app.proactive.getConversationOrThrow(convId)
   * const response = await app.proactive.sendActivity(adapter, conv, { text: 'Hello from the agent!' })
   * console.log('Sent activity ID:', response.id)
   * ```
   */
  sendActivity (adapter: BaseAdapter, conversation: Conversation, activity: Partial<Activity>): Promise<ResourceResponse>
  async sendActivity (
    adapter: BaseAdapter,
    conversationOrId: Conversation | string,
    activity: Partial<Activity>
  ): Promise<ResourceResponse> {
    return trace(ProactiveTraceDefinitions.sendActivity, async ({ record }) => {
      const conv =
        typeof conversationOrId === 'string'
          ? await this.getConversationOrThrow(conversationOrId)
          : conversationOrId

      const activityToSend: Partial<Activity> = { type: 'message', ...activity }

      record({
        conversationId: conv.reference.conversation.id,
        channelId: conv.reference.channelId,
        activityType: activityToSend.type ?? 'message',
      })

      logger.info('sendActivity: conversation=%s channel=%s serviceUrl=%s',
        conv.reference.conversation.id, conv.reference.channelId, conv.reference.serviceUrl)

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

      if (caughtError !== undefined) {
        logger.warn('sendActivity: failed for conversation=%s: %s', conv.reference.conversation.id, caughtError)
        throw caughtError
      }
      if (response === undefined) throw ExceptionHelper.generateException(Error, Errors.ProactiveSendActivityNoResponse)
      logger.debug('sendActivity: sent activity id=%s', response.id)
      return response
    })
  }

  // ---------------------------------------------------------------------------
  // Full-turn handler (loads TurnState, handles auth tokens)
  // ---------------------------------------------------------------------------

  /**
   * Continues a stored conversation by executing the given handler within the context of that
   * conversation, looking it up by ID.
   *
   * See the {@link Conversation} overload for full details.
   *
   * @param adapter - The channel adapter used to continue the conversation.
   * @param conversationId - The ID of a conversation previously stored via {@link storeConversation}.
   * @param handler - The route handler to execute within the continued conversation context.
   * @param autoSignInHandlers - Optional list of OAuth connection names whose tokens should be
   *   acquired before invoking the handler.
   * @param continuationActivity - Optional activity fields merged into the continuation activity,
   *   making them available on `ctx.activity` inside the handler (e.g. `value`, `valueType`).
   * @throws `Error` if no conversation reference is found for the specified ID.
   * @example
   * ```typescript
   * // Scheduled job: send a daily digest to all stored conversations
   * for (const convId of storedIds) {
   *   await app.proactive.continueConversation(adapter, convId, async (ctx, state) => {
   *     await ctx.sendActivity('Here is your daily digest...')
   *   })
   * }
   * ```
   */
  continueConversation (adapter: BaseAdapter, conversationId: string, handler: RouteHandler<TState>, autoSignInHandlers?: string[], continuationActivity?: Partial<Activity>): Promise<void>
  /**
   * Continues an existing conversation by executing the given handler within the context of the
   * provided {@link Conversation} reference. The handler receives a {@link TurnContext} and a
   * freshly loaded {@link TurnState} scoped to the original conversation, enabling the agent to
   * respond as if replying to an incoming activity.
   *
   * @remarks
   * Exceptions thrown inside the handler are captured and re-thrown after the adapter callback
   * completes, since the adapter would otherwise silently swallow them.
   *
   * If `autoSignInHandlers` are supplied and the application has user authorization configured,
   * tokens are acquired before the handler is called. If not all tokens are available and
   * `proactiveOptions.failOnUnsignedInConnections` is not `false`, an error is thrown.
   *
   * @param adapter - The channel adapter used to continue the conversation.
   * @param conversation - A `Conversation` instance created via its constructor or
   *   {@link ConversationBuilder}.
   * @param handler - The route handler to execute within the continued conversation context.
   * @param autoSignInHandlers - Optional list of OAuth connection names whose tokens should be
   *   acquired before invoking the handler.
   * @param continuationActivity - Optional activity fields merged into the continuation activity,
   *   making them available on `ctx.activity` inside the handler (e.g. `value`, `valueType`).
   * @example
   * ```typescript
   * // Continue a conversation with a custom value payload
   * const conv = await app.proactive.getConversationOrThrow(convId)
   * await app.proactive.continueConversation(
   *   adapter,
   *   conv,
   *   async (ctx, state) => {
   *     const payload = ctx.activity.value as { alertType: string }
   *     await ctx.sendActivity(`Alert triggered: ${payload.alertType}`)
   *   },
   *   undefined,
   *   { value: { alertType: 'threshold-exceeded' }, valueType: Proactive.ContinueConversationValueType }
   * )
   * ```
   */
  continueConversation (adapter: BaseAdapter, conversation: Conversation, handler: RouteHandler<TState>, autoSignInHandlers?: string[], continuationActivity?: Partial<Activity>): Promise<void>
  async continueConversation (
    adapter: BaseAdapter,
    conversationOrId: Conversation | string,
    handler: RouteHandler<TState>,
    autoSignInHandlers?: string[],
    continuationActivity?: Partial<Activity>
  ): Promise<void> {
    return trace(ProactiveTraceDefinitions.continueConversation, async ({ record }) => {
      const conv =
        typeof conversationOrId === 'string'
          ? await this.getConversationOrThrow(conversationOrId)
          : conversationOrId

      record({
        conversationId: conv.reference.conversation.id,
        channelId: conv.reference.channelId,
        hasAutoSignIn: !!autoSignInHandlers?.length,
      })

      logger.info('continueConversation: conversation=%s channel=%s serviceUrl=%s',
        conv.reference.conversation.id, conv.reference.channelId, conv.reference.serviceUrl)

      let caughtError: unknown

      await adapter.continueConversation(conv.identity, conv.reference, async (ctx: TurnContext) => {
        try {
          // Merge caller-supplied activity fields (e.g. value, valueType) into the
          // continuation activity so the handler can read request-time parameters.
          if (continuationActivity) {
            Object.assign(ctx.activity, continuationActivity)
          }

          const state = this._app.options.turnStateFactory()
          await state.load(ctx, this.requireAppStorage())

          // Token acquisition (optional — only when auth is configured)
          if (autoSignInHandlers?.length && this._app.hasUserAuthorization) {
            logger.debug('continueConversation: acquiring tokens for handlers: %o', autoSignInHandlers)
            const results = await Promise.all(
              autoSignInHandlers.map((handlerId) =>
                this._app.authorization.getToken(ctx, handlerId).catch(() => ({ token: undefined }))
              )
            )
            const allAcquired = results.every((r) => !!r.token)
            if (!allAcquired) {
              logger.warn('continueConversation: not all tokens acquired for conversation=%s handlers=%o',
                conv.reference.conversation.id, autoSignInHandlers)
              if (this._options.failOnUnsignedInConnections !== false) {
                throw ExceptionHelper.generateException(Error, Errors.ProactiveNotAllTokensAcquired)
              }
            }
          }

          await handler(ctx, state)
          await state.save(ctx, this.requireAppStorage())
        } catch (err) {
          caughtError = err
        } finally {
          if ((ctx as any).streamingResponse?.isStreamStarted?.()) {
            await (ctx as any).streamingResponse.endStream()
          }
        }
      })

      if (caughtError !== undefined) {
        logger.warn('continueConversation: failed for conversation=%s: %s', conv.reference.conversation.id, caughtError)
        throw caughtError
      }
      logger.debug('continueConversation: complete for conversation=%s', conv.reference.conversation.id)
    })
  }

  // ---------------------------------------------------------------------------
  // Create new conversation
  // ---------------------------------------------------------------------------

  /**
   * Creates a new conversation using the specified channel adapter and conversation options.
   *
   * @remarks
   * This wraps `CloudAdapter.createConversationAsync()`, which requires real network connectivity
   * and authentication. The provided adapter must implement
   * `createConversationAsync()`; a `TypeError` is thrown if it does not.
   *
   * If `createOptions.storeConversation` is `true`, the resulting {@link Conversation} is
   * automatically stored via {@link storeConversation} so it can be retrieved by ID later.
   *
   * If a `handler` is provided it is executed within the newly created conversation, giving the
   * agent a chance to send an initial message or load state.
   *
   * @param adapter - The channel adapter used to create the conversation. Must implement
   *   `createConversationAsync()` (i.e. a `CloudAdapter` instance).
   * @param createOptions - Details required to create the conversation, including identity, channel,
   *   service URL, OAuth scope, and `ConversationParameters`. Build with
   *   {@link CreateConversationOptionsBuilder}.
   * @param handler - Optional route handler executed immediately after the conversation is created.
   * @returns The newly created {@link Conversation}.
   * @throws `TypeError` if the adapter does not implement `createConversationAsync()`.
   * @example
   * ```typescript
   * // Initiate a new 1:1 conversation with a Teams user and send a welcome message
   * const opts = CreateConversationOptionsBuilder
   *   .create(process.env.APP_ID!, 'msteams')
   *   .withUser('user-aad-object-id')
   *   .withTenantId('tenant-id')
   *   .storeConversation(true)
   *   .build()
   *
   * const conv = await app.proactive.createConversation(adapter, opts, async (ctx, state) => {
   *   await ctx.sendActivity('Hi! I have an update for you.')
   * })
   * console.log('New conversation ID:', conv.reference.conversation.id)
   * ```
   */
  async createConversation (
    adapter: BaseAdapter,
    createOptions: CreateConversationOptions,
    handler?: RouteHandler<TState>
  ): Promise<Conversation> {
    return trace(ProactiveTraceDefinitions.createConversation, async ({ record }) => {
      record({
        channelId: createOptions.channelId,
        storeConversation: !!createOptions.storeConversation,
        hasHandler: !!handler,
      })

      if (!createOptions.parameters.members?.length) {
        throw ExceptionHelper.generateException(Error, Errors.ProactiveMembersRequired)
      }

      record({ membersCount: createOptions.parameters.members.length })

      // CloudAdapter.createConversationAsync(agentAppId, channelId, serviceUrl, audience, params, logic)
      // The logic callback IS the handler — context is created internally by the adapter.
      const cloudAdapter = adapter as any
      if (typeof cloudAdapter.createConversationAsync !== 'function') {
        throw ExceptionHelper.generateException(TypeError, Errors.ProactiveCloudAdapterRequired)
      }
      logger.info('createConversation: channel=%s serviceUrl=%s members=%d',
        createOptions.channelId, createOptions.serviceUrl, createOptions.parameters.members?.length ?? 0)

      let capturedConv: Conversation | undefined
      let caughtError: unknown

      await cloudAdapter.createConversationAsync(
        createOptions.identity.aud,
        createOptions.channelId,
        createOptions.serviceUrl,
        createOptions.scope,
        createOptions.parameters,
        async (ctx: TurnContext) => {
          try {
            const conv = new Conversation(createOptions.identity, ctx.activity.getConversationReference())
            capturedConv = conv
            logger.debug('createConversation: created conversation=%s', conv.reference.conversation.id)

            if (createOptions.storeConversation) {
              await this.storeConversation(conv)
            }

            if (handler) {
              const state = this._app.options.turnStateFactory()
              await state.load(ctx, this.requireAppStorage())
              await handler(ctx, state)
              await state.save(ctx, this.requireAppStorage())
            }
          } catch (err) {
            caughtError = err
          }
        }
      )

      if (caughtError !== undefined) {
        logger.warn('createConversation: failed for channel=%s: %s', createOptions.channelId, caughtError)
        throw caughtError
      }

      if (!capturedConv) {
        throw ExceptionHelper.generateException(Error, Errors.ProactiveCallbackNotInvoked)
      }
      return capturedConv
    })
  }
}
