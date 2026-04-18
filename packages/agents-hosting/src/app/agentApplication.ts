/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { ResourceResponse } from '../connector-client'
import { debug } from '@microsoft/agents-activity/logger'
import { TurnContext } from '../turnContext'
import { AdaptiveCardsActions } from './adaptiveCards'
import { AgentApplicationOptions, TypingTimingOptions } from './agentApplicationOptions'
import { ConversationUpdateEvents } from './conversationUpdateEvents'
import { AgentExtension } from './extensions'
import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnEvents } from './turnEvents'
import { TurnState } from './turnState'
import { RouteRank } from './routeRank'
import { RouteList } from './routeList'
import { TranscriptLoggerMiddleware } from '../transcript'
import { CloudAdapter } from '../cloudAdapter'
import { Authorization, UserAuthorization, AuthorizationManager } from './auth'
import { Proactive } from './proactive'
import { JwtPayload } from 'jsonwebtoken'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'

const logger = debug('agents:app')

// Resend typing every 4 seconds to stay ahead of the ~5 second timeout seen in
// Web Chat and Microsoft 365. Teams may keep typing indicators visible longer.
const DEFAULT_TYPING_INITIAL_DELAY = 0
const DEFAULT_TYPING_INTERVAL = 4000
const TYPING_TIMER_STATE_KEY = Symbol('typingTimerState')

type TypingTimerState = {
  timer?: NodeJS.Timeout
  lastSend: Promise<unknown>
  stop: () => void
}

type StreamInfoEntity = {
  type?: string
  streamType?: string
}

/**
 * Event handler function type for application events.
 * @typeParam TState - The state type extending TurnState.
 * @param context - The turn context containing activity information.
 * @param state - The current turn state.
 * @returns A promise that resolves to a boolean indicating whether to continue execution.
 */
export type ApplicationEventHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<boolean>

/**
 * Main application class for handling agent conversations and routing.
 *
 * @typeParam TState - The state type extending TurnState.
 *
 * @remarks
 * The AgentApplication class provides a framework for building conversational agents.
 * It handles routing activities to appropriate handlers, manages conversation state,
 * supports authentication flows, and provides various event handling capabilities.
 *
 * Key features:
 * - Activity routing based on type, content, or custom selectors
 * - State management with automatic load/save
 * - OAuth authentication support
 * - Typing indicators and long-running message support
 * - Extensible architecture with custom extensions
 * - Event handlers for before/after turn processing
 *
 * @example
 * ```typescript
 * const app = new AgentApplication<MyState>({
 *   storage: new MemoryStorage(),
 *   adapter: myAdapter
 * });
 *
 * app.onMessage('hello', async (context, state) => {
 *   await context.sendActivity('Hello there!');
 * });
 *
 * await app.run(turnContext);
 * ```
 *
 */
export class AgentApplication<TState extends TurnState> {
  protected readonly _options: AgentApplicationOptions<TState>
  protected readonly _routes: RouteList<TState> = new RouteList<TState>()
  protected readonly _beforeTurn: ApplicationEventHandler<TState>[] = []
  protected readonly _afterTurn: ApplicationEventHandler<TState>[] = []
  private readonly _adapter?: CloudAdapter
  private readonly _authorizationManager?: AuthorizationManager
  private readonly _authorization?: Authorization
  private readonly _proactive?: Proactive<TState>
  protected readonly _extensions: AgentExtension<TState>[] = []
  private readonly _adaptiveCards: AdaptiveCardsActions<TState>

  /**
   * Creates a new instance of AgentApplication.
   *
   * @param options - Optional configuration options for the application.
   *
   * @remarks
   * The constructor initializes the application with default settings and applies
   * any provided options. It sets up the adapter, authorization, and other core
   * components based on the configuration.
   *
   * Default options:
   * - startTypingTimer: false
   * - longRunningMessages: false
   * - removeRecipientMention: true
   * - turnStateFactory: Creates a new TurnState instance
   *
   * @example
   * ```typescript
   * const app = new AgentApplication({
   *   storage: new MemoryStorage(),
   *   adapter: myAdapter,
   *   startTypingTimer: true,
   *   authorization: { connectionName: 'oauth' },
   *   transcriptLogger: myTranscriptLogger,
   * });
   * ```
   */
  public constructor (options?: Partial<AgentApplicationOptions<TState>>) {
    this._options = {
      ...options,
      turnStateFactory: options?.turnStateFactory || (() => new TurnState() as TState),
      startTypingTimer: options?.startTypingTimer !== undefined ? options.startTypingTimer : false,
      typing: options?.typing || undefined,
      longRunningMessages: options?.longRunningMessages !== undefined ? options.longRunningMessages : false,
      removeRecipientMention: options?.removeRecipientMention !== undefined ? options.removeRecipientMention : true,
      transcriptLogger: options?.transcriptLogger || undefined,
    }

    this._adaptiveCards = new AdaptiveCardsActions<TState>(this)

    if (this._options.adapter) {
      this._adapter = this._options.adapter
    } else {
      this._adapter = new CloudAdapter()
    }

    if (this._options.authorization) {
      this._authorizationManager = new AuthorizationManager(this, this._adapter.connectionManager)
      this._authorization = new UserAuthorization(this._authorizationManager)
    }

    // Create Proactive whenever proactive options are explicitly configured or a storage
    // backend is available — no explicit `proactive` option is required.
    if (this._options.proactive !== undefined || this._options.storage !== undefined) {
      const proactiveOpts = this._options.proactive ?? {}
      const proactiveStorage = proactiveOpts.storage ?? this._options.storage
      this._proactive = new Proactive<TState>(this, { ...proactiveOpts, storage: proactiveStorage })
    }

    if (this._options.longRunningMessages && !this._adapter && !this._options.agentAppId) {
      throw new Error('The Application.longRunningMessages property is unavailable because no adapter was configured in the app.')
    }

    if (this._options.transcriptLogger) {
      if (!this._options.adapter) {
        throw new Error('The Application.transcriptLogger property is unavailable because no adapter was configured in the app.')
      } else {
        this._adapter?.use(new TranscriptLoggerMiddleware(this._options.transcriptLogger))
      }
    }
    logger.debug('AgentApplication created with options:', this._options)
  }

  /**
   * Gets the authorization instance for the application.
   *
   * @returns The authorization instance.
   * @throws Error if no authentication options were configured.
   */
  public get authorization (): Authorization {
    if (!this._authorization) {
      throw new Error('The Application.authorization property is unavailable because no authorization options were configured.')
    }
    return this._authorization
  }

  /**
   * Gets the proactive messaging subsystem.
   *
   * @throws Error if no storage backend was configured (neither `options.storage` nor
   *   `options.proactive.storage`).
   */
  public get proactive (): Proactive<TState> {
    if (!this._proactive) {
      throw ExceptionHelper.generateException(Error, Errors.ProactivePropertyUnavailable)
    }
    return this._proactive
  }

  /**
   * Returns `true` if user authorization was configured, without throwing.
   * Used internally by the Proactive subsystem to check whether token acquisition is available.
   */
  public get hasUserAuthorization (): boolean {
    return this._authorization !== undefined
  }

  /**
   * Gets the options used to configure the application.
   *
   * @returns The application options.
   */
  public get options (): AgentApplicationOptions<TState> {
    return this._options
  }

  /**
   * Gets the adapter used by the application.
   *
   * @returns The adapter instance.
   */
  public get adapter (): CloudAdapter {
    return this._adapter!
  }

  /**
   * Gets the adaptive cards actions handler for the application.
   *
   * @returns The adaptive cards actions instance.
   *
   * @remarks
   * The adaptive cards actions handler provides functionality for handling
   * adaptive card interactions, such as submit actions and other card-based events.
   *
   * @example
   * ```typescript
   * app.adaptiveCards.actionSubmit('doStuff', async (context, state, data) => {
   *   await context.sendActivity(`Received data: ${JSON.stringify(data)}`);
   * });
   * ```
   */
  public get adaptiveCards (): AdaptiveCardsActions<TState> {
    return this._adaptiveCards
  }

  /**
   * Sets an error handler for the application.
   *
   * @param handler - The error handler function to be called when an error occurs.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method allows you to handle any errors that occur during turn processing.
   * The handler will receive the turn context and the error that occurred.
   *
   * @example
   * ```typescript
   * app.onError(async (context, error) => {
   *   console.error(`An error occurred: ${error.message}`);
   *   await context.sendActivity('Sorry, something went wrong!');
   * });
   * ```
   *
   */
  public onError (handler: (context: TurnContext, error: Error) => Promise<void>): this {
    if (this._adapter) {
      this._adapter.onTurnError = handler
    }
    return this
  }

  /**
   * Adds a new route to the application for handling activities.
   *
   * @param selector - The selector function that determines if a route should handle the current activity.
   * @param handler - The handler function that will be called if the selector returns true.
   * @param isInvokeRoute - Whether this route is for invoke activities. Defaults to false.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param authHandlers - Array of authentication handler names for this route. Defaults to empty array.
   * @param isAgenticRoute - Whether this route is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   *
   * @remarks
   * Routes are evaluated by rank order (if provided), otherwise, in the order they are added.
   * Invoke-based activities receive special treatment and are matched separately as they typically
   * have shorter execution timeouts.
   *
   * @example
   * ```typescript
   * app.addRoute(
   *   async (context) => context.activity.type === ActivityTypes.Message,
   *   async (context, state) => {
   *     await context.sendActivity('I received your message');
   *   },
   *   false, // isInvokeRoute
   *   RouteRank.First // rank
   * );
   * ```
   *
   */
  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>, isInvokeRoute: boolean = false, rank: number = RouteRank.Unspecified, authHandlers: string[] = [], isAgenticRoute: boolean = false): this {
    this._routes.addRoute(selector, handler, isInvokeRoute, rank, authHandlers, isAgenticRoute)
    return this
  }

  /**
   * Adds a handler for specific activity types.
   *
   * @param type - The activity type(s) to handle. Can be a string, RegExp, RouteSelector, or array of these types.
   * @param handler - The handler function that will be called when the specified activity type is received.
   * @param authHandlers - Array of authentication handler names for this activity. Defaults to empty array.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param isAgenticRoute - Indicates if this handler is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method allows you to register handlers for specific activity types such as 'message', 'conversationUpdate', etc.
   * You can specify multiple activity types by passing an array.
   *
   * @example
   * ```typescript
   * app.onActivity(ActivityTypes.Message, async (context, state) => {
   *   await context.sendActivity('I received your message');
   * });
   * ```
   *
   */
  public onActivity (
    type: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>,
    authHandlers: string[] = [],
    rank: RouteRank = RouteRank.Unspecified,
    isAgenticRoute: boolean = false
  ): this {
    (Array.isArray(type) ? type : [type]).forEach((t) => {
      const selector = this.createActivitySelector(t, isAgenticRoute)
      this.addRoute(selector, handler, false, rank, authHandlers, isAgenticRoute)
    })
    return this
  }

  /**
   * Adds a handler for conversation update events.
   *
   * @param event - The conversation update event to handle (e.g., 'membersAdded', 'membersRemoved').
   * @param handler - The handler function that will be called when the specified event occurs.
   * @param authHandlers - Array of authentication handler names for this event. Defaults to empty array.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param isAgenticRoute - Indicates if this handler is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   * @throws Error if the handler is not a function.
   *
   * @remarks
   * Conversation update events occur when the state of a conversation changes, such as when members join or leave.
   *
   * @example
   * ```typescript
   * app.onConversationUpdate('membersAdded', async (context, state) => {
   *   const membersAdded = context.activity.membersAdded;
   *   for (const member of membersAdded) {
   *     if (member.id !== context.activity.recipient.id) {
   *       await context.sendActivity('Hello and welcome!');
   *     }
   *   }
   * });
   * ```
   *
   */
  public onConversationUpdate (
    event: ConversationUpdateEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>,
    authHandlers: string[] = [],
    rank: RouteRank = RouteRank.Unspecified,
    isAgenticRoute: boolean = false
  ): this {
    if (typeof handler !== 'function') {
      throw new Error(
                `ConversationUpdate 'handler' for ${event} is ${typeof handler}. Type of 'handler' must be a function.`
      )
    }

    const selector = this.createConversationUpdateSelector(event, isAgenticRoute)
    this.addRoute(selector, handler, false, rank, authHandlers, isAgenticRoute)
    return this
  }

  /**
   * Continues a conversation asynchronously.
   *
   * @param conversationReferenceOrContext - The conversation reference or turn context.
   * @param logic - The logic to execute during the conversation.
   * @returns A promise that resolves when the conversation logic has completed.
   * @throws Error if the adapter is not configured.
   */
  protected async continueConversationAsync (
    botAppIdOrIdentity: string | JwtPayload,
    conversationReferenceOrContext: ConversationReference | TurnContext,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void> {
    if (!this._adapter) {
      throw new Error(
        "You must configure the Application with an 'adapter' before calling Application.continueConversationAsync()"
      )
    }

    if (!this.options.agentAppId) {
      logger.warn("Calling Application.continueConversationAsync() without a configured 'agentAppId'. In production environments, a 'agentAppId' is required.")
    }

    let reference: ConversationReference

    if ('activity' in conversationReferenceOrContext) {
      reference = conversationReferenceOrContext.activity.getConversationReference()
    } else {
      reference = conversationReferenceOrContext
    }

    await this._adapter.continueConversation(botAppIdOrIdentity, reference, logic)
  }

  /**
   * Adds a handler for message activities that match the specified keyword or pattern.
   *
   * @param keyword - The keyword, pattern, or selector function to match against message text.
   *                  Can be a string, RegExp, RouteSelector, or array of these types.
   * @param handler - The handler function that will be called when a matching message is received.
   * @param authHandlers - Array of authentication handler names for this message handler. Defaults to empty array.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param isAgenticRoute - Indicates if this handler is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method allows you to register handlers for specific message patterns.
   * If keyword is a string, it matches messages containing that string.
   * If keyword is a RegExp, it tests the message text against the regular expression.
   * If keyword is a function, it calls the function with the context to determine if the message matches.
   *
   * @example
   * ```typescript
   * app.onMessage('hello', async (context, state) => {
   *   await context.sendActivity('Hello there!');
   * });
   *
   * app.onMessage(/help/i, async (context, state) => {
   *   await context.sendActivity('How can I help you?');
   * });
   * ```
   *
   */
  public onMessage (
    keyword: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>,
    authHandlers: string[] = [],
    rank: RouteRank = RouteRank.Unspecified,
    isAgenticRoute: boolean = false
  ): this {
    (Array.isArray(keyword) ? keyword : [keyword]).forEach((k) => {
      const selector = this.createMessageSelector(k, isAgenticRoute)
      this.addRoute(selector, handler, false, rank, authHandlers, isAgenticRoute)
    })
    return this
  }

  /**
   * Sets a handler to be called when a user successfully signs in.
   *
   * @param handler - The handler function to be called after successful sign-in.
   * @returns The current instance of the application.
   * @throws Error if authentication options were not configured.
   *
   * @remarks
   * This method allows you to perform actions after a user has successfully authenticated.
   * The handler will receive the turn context and state.
   *
   * @example
   * ```typescript
   * app.onSignInSuccess(async (context, state) => {
   *   await context.sendActivity('You have successfully signed in!');
   * });
   * ```
   *
   */
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, id?: string) => Promise<void>): this {
    if (this.options.authorization) {
      this.authorization.onSignInSuccess(handler)
    } else {
      throw new Error(
        'The Application.authorization property is unavailable because no authorization options were configured.'
      )
    }
    return this
  }

  /**
   * Sets a handler to be called when a sign-in attempt fails.
   *
   * @param handler - The handler function to be called after a failed sign-in attempt.
   * @returns The current instance of the application.
   * @throws Error if authentication options were not configured.
   *
   * @remarks
   * This method allows you to handle cases where a user fails to authenticate,
   * such as when they cancel the sign-in process or an error occurs.
   *
   * @example
   * ```typescript
   * app.onSignInFailure(async (context, state) => {
   *   await context.sendActivity('Sign-in failed. Please try again.');
   * });
   * ```
   *
   */
  public onSignInFailure (handler: (context: TurnContext, state: TurnState, id?: string) => Promise<void>): this {
    if (this.options.authorization) {
      this.authorization.onSignInFailure(handler)
    } else {
      throw new Error(
        'The Application.authorization property is unavailable because no authorization options were configured.'
      )
    }
    return this
  }

  /**
   * Adds a handler for message reaction added events.
   *
   * @param handler - The handler function that will be called when a message reaction is added.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param isAgenticRoute - Indicates if this handler is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method registers a handler that will be invoked when a user adds a reaction to a message,
   * such as a like, heart, or other emoji reaction.
   *
   * @example
   * ```typescript
   * app.onMessageReactionAdded(async (context, state) => {
   *   const reactionsAdded = context.activity.reactionsAdded;
   *   if (reactionsAdded && reactionsAdded.length > 0) {
   *     await context.sendActivity(`Thanks for your ${reactionsAdded[0].type} reaction!`);
   *   }
   * });
   * ```
   *
   */
  public onMessageReactionAdded (
    handler: (context: TurnContext, state: TState) => Promise<void>,
    rank: RouteRank = RouteRank.Unspecified,
    isAgenticRoute: boolean = false): this {
    const selector = async (context: TurnContext): Promise<boolean> => {
      return context.activity.type === ActivityTypes.MessageReaction &&
             Array.isArray(context.activity.reactionsAdded) &&
             context.activity.reactionsAdded.length > 0 &&
             (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))
    }

    this.addRoute(selector, handler, false, rank, [], isAgenticRoute)
    return this
  }

  /**
   * Adds a handler for message reaction removed events.
   *
   * @param handler - The handler function that will be called when a message reaction is removed.
   * @param rank - The rank of the route, used to determine the order of evaluation. Defaults to RouteRank.Unspecified.
   * @param isAgenticRoute - Indicates if this handler is for agentic requests only. Defaults to false.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method registers a handler that will be invoked when a user removes a reaction from a message,
   * such as unliking or removing an emoji reaction.
   *
   * @example
   * ```typescript
   * app.onMessageReactionRemoved(async (context, state) => {
   *   const reactionsRemoved = context.activity.reactionsRemoved;
   *   if (reactionsRemoved && reactionsRemoved.length > 0) {
   *     await context.sendActivity(`You removed your ${reactionsRemoved[0].type} reaction.`);
   *   }
   * });
   * ```
   *
   */
  public onMessageReactionRemoved (
    handler: (context: TurnContext, state: TState) => Promise<void>,
    rank: RouteRank = RouteRank.Unspecified,
    isAgenticRoute: boolean = false): this {
    const selector = async (context: TurnContext): Promise<boolean> => {
      return context.activity.type === ActivityTypes.MessageReaction &&
             Array.isArray(context.activity.reactionsRemoved) &&
             context.activity.reactionsRemoved.length > 0 &&
             (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))
    }

    this.addRoute(selector, handler, false, rank, undefined, isAgenticRoute)
    return this
  }

  /**
   * Executes the application logic for a given turn context.
   *
   * @param turnContext - The context for the current turn of the conversation.
   * @returns A promise that resolves when the application logic has completed.
   *
   * @remarks
   * This method is the entry point for processing a turn in the conversation.
   * It delegates the actual processing to the `runInternal` method, which handles
   * the core logic for routing and executing handlers.
   *
   * @example
   * ```typescript
   * const app = new AgentApplication();
   * await app.run(turnContext);
   * ```
   *
   */
  public async run (turnContext:TurnContext): Promise<void> {
    await this.runInternal(turnContext)
  }

  /**
   * Executes the application logic for a given turn context.
   *
   * @param turnContext - The context for the current turn of the conversation.
   * @returns A promise that resolves to true if a handler was executed, false otherwise.
   *
   * @remarks
   * This is the core internal method that processes a turn in the conversation.
   * It handles routing and executing handlers based on the activity type and content.
   * While this method is public, it's typically called internally by the `run` method.
   *
   * The method performs the following operations:
   * 1. Handles authentication flows for routes that have auth handlers configured. If NOT authorized, it will not continue with the 2nd step, returning false.
   * 2. Starts typing timer if configured
   * 3. Processes mentions if configured
   * 4. Loads turn state
   * 5. Downloads files if file downloaders are configured
   * 6. Executes before-turn event handlers
   * 7. Routes to appropriate handlers
   * 8. Executes after-turn event handlers
   * 9. Saves turn state
   *
   * @example
   * ```typescript
   * const handled = await app.runInternal(turnContext);
   * if (!handled) {
   *   console.log('No handler matched the activity');
   * }
   * ```
   */
  public async runInternal (turnContext: TurnContext): Promise<boolean> {
    const { authorized, context } = await this.handleAuthorization(turnContext)

    if (!authorized) {
      // We don't log a message here because it is handled by the authorization manager and could cause confusion during mid sign-in operations.
      return false
    }

    const isLongRunning =
      (turnContext.activity.type === ActivityTypes.Invoke && turnContext.activity.name === 'signin/tokenExchange') ||
      (this._options.longRunningMessages && turnContext.activity.type === ActivityTypes.Message)

    if (isLongRunning) {
      logger.debug('Starting long-running messages for activity:', context.activity.id!)
      this.startLongRunningCall(context, ctx => this.runTurn(ctx))
      return true
    }

    logger.info('Running application with activity:', context.activity.id!)
    return this.runTurn(context)
  }

  /**
   * Determines if the incoming activity is authorized to be processed by the application.
   * @returns An object containing the authorization status and the context (could have the continuation activity) to be used for further processing.
   */
  private async handleAuthorization (context: TurnContext) {
    if (context.activity.type === ActivityTypes.Typing) {
      return { authorized: true, context }
    }

    return this._authorizationManager?.process(context, async activity => {
      // The incoming activity may come from the storage, so we need to restore the auth handlers.
      // Since the current route may not have auth handlers.
      const route = await this.getRoute(new TurnContext(context.adapter, activity, context.identity))
      return route?.authHandlers ?? []
    }) ?? { authorized: true, context } // If no authorization manager is configured, we assume the activity is authorized.
  }

  /**
   * Executes the turn processing logic for the given context, including routing and handler execution.
   */
  private async runTurn (context: TurnContext): Promise<boolean> {
    try {
      if (this._options.startTypingTimer) {
        this.startTypingTimer(context)
      }

      if (this._options.removeRecipientMention && context.activity.type === ActivityTypes.Message) {
        context.activity.removeRecipientMention()
      }

      if (this._options.normalizeMentions && context.activity.type === ActivityTypes.Message) {
        context.activity.normalizeMentions()
      }

      const { storage, turnStateFactory } = this._options
      const state = turnStateFactory()
      await state.load(context, storage)

      const route = await this.getRoute(context)

      if (!route) {
        logger.debug('No matching route found for activity:', context.activity)
        return false
      }

      if (Array.isArray(this._options.fileDownloaders) && this._options.fileDownloaders.length > 0) {
        for (let i = 0; i < this._options.fileDownloaders.length; i++) {
          await this._options.fileDownloaders[i].downloadAndStoreFiles(context, state)
        }
      }

      if (!(await this.callEventHandlers(context, state, this._beforeTurn))) {
        await state.save(context, storage)
        return false
      }

      await route.handler(context, state)

      if (await this.callEventHandlers(context, state, this._afterTurn)) {
        await state.save(context, storage)
      }

      return true
    } catch (err: any) {
      logger.error(err)
      throw err
    } finally {
      this.stopTypingTimer(context)
    }
  }

  /**
   * Finds the appropriate route for the given context.
   */
  private async getRoute (context: TurnContext) {
    for (const route of this._routes) {
      if (await route.selector(context)) {
        return route
      }
    }
  }

  /**
   * Sends a proactive message to a conversation.
   *
   * @param context - The turn context or conversation reference to use.
   * @param activityOrText - The activity or text to send.
   * @param speak - Optional text to be spoken by the bot on a speech-enabled channel.
   * @param inputHint - Optional input hint for the activity.
   * @returns A promise that resolves to the resource response from sending the activity.
   *
   * @remarks
   * This method allows you to send messages proactively to a conversation, outside the normal turn flow.
   *
   * @example
   * ```typescript
   * // With conversation reference
   * await app.sendProactiveActivity(conversationReference, 'Important notification!');
   *
   * // From an existing context
   * await app.sendProactiveActivity(turnContext, 'Important notification!');
   * ```
   *
   */
  public async sendProactiveActivity (
    botAppIdOrIdentity: string | JwtPayload,
    context: TurnContext | ConversationReference,
    activityOrText: string | Activity,
    speak?: string,
    inputHint?: string
  ): Promise<ResourceResponse | undefined> {
    let response: ResourceResponse | undefined
    await this.continueConversationAsync(botAppIdOrIdentity, context, async (ctx) => {
      response = await ctx.sendActivity(activityOrText, speak, inputHint)
    })

    return response
  }

  /**
   * Starts a typing indicator timer for the current turn context.
   *
   * @param context - The turn context for the current conversation.
   * @returns void
   *
   * @remarks
   * This method starts a timer that sends typing activity indicators to the user
   * at regular intervals. The typing indicator continues until a message is sent
   * or the timer is explicitly stopped.
   *
   * The typing indicator helps provide feedback to users that the agent is processing
   * their message, especially when responses might take time to generate.
   *
   * @example
   * ```typescript
   * app.startTypingTimer(turnContext);
   * // Do some processing...
   * await turnContext.sendActivity('Response after processing');
   * // Typing timer automatically stops when sending a message
   * ```
   *
   */
  public startTypingTimer (context: TurnContext): void {
    const turnState = context.turnState
    const typingOptions = this.getTypingTimingOptions(context)
    // Timer state is stored on the current turn so concurrent turns stay isolated.
    const currentState = () => turnState.get<TypingTimerState>(TYPING_TIMER_STATE_KEY)

    if (context.activity.type !== ActivityTypes.Message || currentState()) {
      return
    }

    const state: TypingTimerState = {
      lastSend: Promise.resolve(),
      stop: () => {
        if (state.timer) {
          clearTimeout(state.timer)
          state.timer = undefined
        }

        turnState.delete(TYPING_TIMER_STATE_KEY)
      }
    }

    turnState.set(TYPING_TIMER_STATE_KEY, state)

    context.onSendActivities(async (context, activities, next) => {
      // Any real response or stream start ends the typing loop for this turn.
      if (activities.some(activity => activity.type === ActivityTypes.Message || this.getStreamType(activity) !== undefined)) {
        state.stop()
        // Wait for any in-flight typing send to finish before sending the real response.
        await state.lastSend.catch((err: any) => {
          logger.error(err)
        })
      }

      return next()
    })

    const onTimeout = async () => {
      try {
        state.lastSend = this.sendTypingActivity(context)
        await state.lastSend
      } catch (err: any) {
        logger.error(err)
        state.lastSend = Promise.resolve()
        state.stop()
        return
      }

      // Only reschedule if this turn still owns the active timer state.
      if (currentState() === state) {
        state.timer = setTimeout(onTimeout, typingOptions.intervalMs)
      }
    }

    state.timer = setTimeout(onTimeout, typingOptions.initialDelayMs)
  }

  private getTypingTimingOptions (context: TurnContext): Required<TypingTimingOptions> {
    const channelId = context.activity.channelId || context.activity.channelIdChannel || ''
    const channelOptions = channelId ? this._options.typing?.channelStrategies?.[channelId] : undefined

    return {
      initialDelayMs: channelOptions?.initialDelayMs ?? this._options.typing?.initialDelayMs ?? DEFAULT_TYPING_INITIAL_DELAY,
      intervalMs: channelOptions?.intervalMs ?? this._options.typing?.intervalMs ?? DEFAULT_TYPING_INTERVAL
    }
  }

  private getStreamType (activity: Activity): string | undefined {
    const streamingEntity = activity.entities?.find((entity) => (entity as StreamInfoEntity).type === 'streaminfo') as StreamInfoEntity | undefined
    return streamingEntity?.streamType ?? activity.channelData?.streamType
  }

  private async sendTypingActivity (context: TurnContext): Promise<ResourceResponse[] | undefined> {
    const conversationReference = context.activity.getConversationReference()
    const typingActivity = Activity.fromObject({ type: ActivityTypes.Typing }).applyConversationReference(conversationReference)

    return await context.adapter.sendActivities(context, [typingActivity])
  }

  /**
   * Registers an extension with the application.
   *
   * @typeParam T - The extension type extending AgentExtension.
   * @param extension - The extension instance to register.
   * @param regcb - Callback function called after successful registration.
   * @throws Error if the extension is already registered.
   *
   * @remarks
   * Extensions provide a way to add custom functionality to the application.
   * Each extension can only be registered once to prevent conflicts.
   *
   * @example
   * ```typescript
   * const myExtension = new MyCustomExtension();
   * app.registerExtension(myExtension, (ext) => {
   *   console.log('Extension registered:', ext.name);
   * });
   * ```
   *
   */
  public registerExtension<T extends AgentExtension<TState>> (extension: T, regcb : (ext:T) => void): void {
    if (this._extensions.includes(extension)) {
      throw new Error('Extension already registered')
    }
    this._extensions.push(extension)
    regcb(extension)
  }

  /**
   * Stops the typing indicator timer if it's currently running.
   *
   * @returns void
   *
   * @remarks
   * Calling this overload without a context is deprecated. It only logs a warning and does not stop any timer.
   *
   * @deprecated Pass the current TurnContext to stop only that turn's typing timer.
   */
  public stopTypingTimer (): void

  /**
   * Stops the typing indicator timer for the provided turn context.
   *
   * @param context - The turn context whose typing timer should be stopped.
   * @returns void
   *
   * @remarks
   * This method clears the typing indicator timer for the current turn to prevent further typing indicators
   * from being sent. It's typically called automatically when a message is sent, but can also be called manually.
   *
   * @example
   * ```typescript
   * app.startTypingTimer(turnContext)
   * // Do some processing...
   * app.stopTypingTimer(turnContext)
   * ```
   */
  public stopTypingTimer (context: TurnContext): void
  public stopTypingTimer (context?: TurnContext): void {
    if (!context) {
      logger.warn('Application.stopTypingTimer() without a context is deprecated. Pass the current TurnContext instead.')
      return
    }

    context.turnState.get<TypingTimerState>(TYPING_TIMER_STATE_KEY)?.stop()
  }

  /**
   * Adds an event handler for specified turn events.
   *
   * @param event - The turn event(s) to handle. Can be 'beforeTurn', 'afterTurn', or other custom events.
   * @param handler - The handler function that will be called when the event occurs.
   * @returns The current instance of the application.
   *
   * @remarks
   * Turn events allow you to execute logic before or after the main turn processing.
   * Handlers added for 'beforeTurn' are executed before routing logic.
   * Handlers added for 'afterTurn' are executed after routing logic.
   *
   * @example
   * ```typescript
   * app.onTurn('beforeTurn', async (context, state) => {
   *   console.log('Processing before turn');
   *   return true; // Continue execution
   * });
   * ```
   *
   */
  public onTurn (
    event: TurnEvents | TurnEvents[],
    handler: (context: TurnContext, state: TState) => Promise<boolean>
  ): this {
    (Array.isArray(event) ? event : [event]).forEach((e) => {
      switch (e) {
        case 'beforeTurn':
          this._beforeTurn.push(handler)
          break
        case 'afterTurn':
          this._afterTurn.push(handler)
          break
        default:
          this._beforeTurn.push(handler)
          break
      }
    })
    return this
  }

  /**
   * Calls a series of event handlers in sequence.
   *
   * @param context - The turn context for the current conversation.
   * @param state - The current turn state.
   * @param handlers - Array of event handlers to call.
   * @returns A promise that resolves to true if all handlers returned true, false otherwise.
   */
  protected async callEventHandlers (
    context: TurnContext,
    state: TState,
    handlers: ApplicationEventHandler<TState>[]
  ): Promise<boolean> {
    for (let i = 0; i < handlers.length; i++) {
      const continueExecution = await handlers[i](context, state)
      if (!continueExecution) {
        return false
      }
    }

    return true
  }

  /**
   * Starts a long-running call by continuing the conversation asynchronously (fire-and-forget).
   * The current request/response cycle is not blocked; errors are forwarded to the adapter's error handler.
   *
   * @param context - The turn context for the current conversation.
   * @param handler - The handler function to execute in the continued conversation.
   */
  protected startLongRunningCall (
    context: TurnContext,
    handler: (context: TurnContext) => Promise<any>
  ) {
    const activity = Activity.fromObject(context.activity)
    this.continueConversationAsync(context.identity, activity.getConversationReference(), async (ctx) => {
      try {
        Object.assign(ctx.activity, activity)
        await handler(ctx)
      } catch (err) {
        if (this.adapter.onTurnError && err instanceof Error) {
          await this.adapter.onTurnError(ctx, err)
        } else {
          throw err
        }
      }
    }).catch(err => {
      logger.error(`Unhandled error in long-running call for activity '${activity.type}' (id: ${activity.id}):`, err)
    })
  }

  /**
   * Creates a selector function for activity types.
   *
   * @param type - The activity type to match. Can be a string, RegExp, or RouteSelector function.
   * @param isAgenticRoute - Indicates if the route is for agentic requests only. Defaults to false.
   * @returns A RouteSelector function that matches the specified activity type.
   */
  private createActivitySelector (type: string | RegExp | RouteSelector, isAgenticRoute: boolean = false): RouteSelector {
    if (typeof type === 'function') {
      return type
    } else if (type instanceof RegExp) {
      return (context: TurnContext) => {
        return Promise.resolve(context?.activity?.type
          ? type.test(context.activity.type) && (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))
          : false)
      }
    } else {
      const typeName = type.toString().toLocaleLowerCase()
      return (context: TurnContext) => {
        return Promise.resolve(
          context?.activity?.type
            ? context.activity.type.toLocaleLowerCase() === typeName && (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))
            : false
        )
      }
    }
  }

  /**
   * Creates a selector function for conversation update events.
   *
   * @param event - The conversation update event to match.
   * @param isAgenticRoute - Indicates if the route is for agentic requests only. Defaults to false.
   * @returns A RouteSelector function that matches the specified conversation update event.
   */
  private createConversationUpdateSelector (event: ConversationUpdateEvents, isAgenticRoute: boolean = false): RouteSelector {
    switch (event) {
      case 'membersAdded':
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest())) &&
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          Array.isArray(context?.activity?.membersAdded) &&
                          context.activity.membersAdded.length > 0
          )
        }
      case 'membersRemoved':
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest())) &&
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          Array.isArray(context?.activity?.membersRemoved) &&
                          context.activity.membersRemoved.length > 0
          )
        }
      default:
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest())) &&
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          context?.activity?.channelData?.eventType === event
          )
        }
    }
  }

  /**
   * Creates a selector function for message content matching.
   *
   * @param keyword - The keyword, pattern, or selector function to match against message text.
   * @param isAgenticRoute - Indicates if the route is for agentic requests only. Defaults to false.
   * @returns A RouteSelector function that matches messages based on the specified keyword.
   */
  private createMessageSelector (keyword: string | RegExp | RouteSelector, isAgenticRoute: boolean = false): RouteSelector {
    if (typeof keyword === 'function') {
      return keyword
    } else if (keyword instanceof RegExp) {
      return (context: TurnContext) => {
        if (context?.activity?.type === ActivityTypes.Message &&
          context.activity.text &&
          (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))) {
          return Promise.resolve(keyword.test(context.activity.text))
        } else {
          return Promise.resolve(false)
        }
      }
    } else {
      const k = keyword.toString().toLocaleLowerCase()
      return (context: TurnContext) => {
        if (context?.activity?.type === ActivityTypes.Message &&
          context.activity.text &&
        (!isAgenticRoute || (isAgenticRoute && context.activity.isAgenticRequest()))) {
          return Promise.resolve(context.activity.text.toLocaleLowerCase() === k)
        } else {
          return Promise.resolve(false)
        }
      }
    }
  }
}
