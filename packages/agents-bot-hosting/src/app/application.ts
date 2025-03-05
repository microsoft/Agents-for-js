/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  TurnContext,
  ResourceResponse
} from '..'
import { TurnState } from './turnState'
import { BotAdapter } from '../botAdapter'
import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-bot-activity'
import { ApplicationOptions } from './applicationOptions'
import { RouteSelector } from './routeSelector'
import { RouteHandler } from './routeHandler'
import { ConversationUpdateEvents } from './conversationUpdateEvents'
import { TurnEvents } from './turnEvents'

const TYPING_TIMER_DELAY = 1000

/**
 * Application class for routing and processing incoming requests.
 * @remarks
 * The Application object replaces the traditional ActivityHandler that a bot would use. It supports
 * a simpler fluent style of authoring bots versus the inheritance based approach used by the
 * ActivityHandler class.
 *
 * Additionally, it has built-in support for calling into the SDK's AI system and can be used to create
 * bots that leverage Large Language Models (LLM) and other AI capabilities.
 * @template TState Optional. Type of the turn state. This allows for strongly typed access to the turn state.
 */
export class Application<TState extends TurnState = TurnState> {
  private readonly _options: ApplicationOptions<TState>
  private readonly _routes: AppRoute<TState>[] = []
  private readonly _beforeTurn: ApplicationEventHandler<TState>[] = []
  private readonly _afterTurn: ApplicationEventHandler<TState>[] = []
  private readonly _adapter?: BotAdapter
  private _typingTimer: any

  /**
     * Creates a new Application instance.
     * @param {ApplicationOptions<TState>} options Optional. Options used to configure the application.
     */
  public constructor (options?: Partial<ApplicationOptions<TState>>) {
    this._options = {
      ...options,
      turnStateFactory: options?.turnStateFactory || (() => new TurnState() as TState),
      startTypingTimer: options?.startTypingTimer !== undefined ? options.startTypingTimer : true,
      longRunningMessages: options?.longRunningMessages !== undefined ? options.longRunningMessages : false
    }

    // Create Adapter
    if (this._options.adapter) {
      this._adapter = this._options.adapter
    }

    // Validate long running messages configuration
    if (this._options.longRunningMessages && !this._adapter && !this._options.botAppId) {
      throw new Error(
        'The Application.longRunningMessages property is unavailable because no adapter or botAppId was configured.'
      )
    }
  }

  /**
     * The bot's adapter.
     * @returns {BotAdapter} The bot's adapter that is configured for the application.
     */
  public get adapter (): BotAdapter {
    if (!this._adapter) {
      throw new Error(
        'The Application.adapter property is unavailable because it was not configured when creating the Application.'
      )
    }

    return this._adapter
  }

  /**
     * The application's configured options.
     * @returns {ApplicationOptions<TState>} The application's configured options.
     */
  public get options (): ApplicationOptions<TState> {
    return this._options
  }

  /**
     * Sets the bot's error handler
     * @param {Function} handler Function to call when an error is encountered.
     * @returns {this} The application instance for chaining purposes.
     */
  public error (handler: (context: TurnContext, error: Error) => Promise<void>): this {
    if (this._adapter) {
      this._adapter.onTurnError = handler
    }

    return this
  }

  /**
     * Adds a new route to the application.
     * @remarks
     * Developers won't typically need to call this method directly as it's used internally by all
     * of the fluent interfaces to register routes for their specific activity types.
     *
     * Routes will be matched in the order they're added to the application. The first selector to
     * return `true` when an activity is received will have its handler called.
     *
     * have shorter execution timeouts.
     * @param {RouteSelector} selector Function thats used to select a route. The function should return true to trigger the route.
     * @param {RouteHandler<TState>} handler Function to call when the route is triggered.
     * @returns {this} The application instance for chaining purposes.
     */
  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>): this {
    this._routes.push({ selector, handler })
    return this
  }

  /**
     * Handles incoming activities of a given type.
     * @param {string | RegExp | RouteSelector | string[] | RegExp[] | RouteSelector[]} type Name of the activity type to match or a regular expression to match against the incoming activity type. An array of type names or expression can also be passed in.
     * @param {(context: TurnContext, state: TState) => Promise<void>} handler Function to call when the route is triggered.
     * @param {TurnContext} handler.context The context object for the turn.
     * @param {TState} handler.state The state object for the turn.
     * @returns {this} The application instance for chaining purposes.
     */
  public activity (
    type: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    (Array.isArray(type) ? type : [type]).forEach((t) => {
      const selector = createActivitySelector(t)
      this.addRoute(selector, handler)
    })
    return this
  }

  /**
     * Handles conversation update events.
     * @param {ConversationUpdateEvents} event Name of the conversation update event to handle.
     * @param {(context: TurnContext, state: TState) => Promise<void>} handler Function to call when the route is triggered.
     * @param {TurnContext} handler.context The context object for the turn.
     * @param {TState} handler.state The state object for the turn.
     * @returns {this} The application instance for chaining purposes.
     */
  public conversationUpdate (
    event: ConversationUpdateEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    if (typeof handler !== 'function') {
      throw new Error(
                `ConversationUpdate 'handler' for ${event} is ${typeof handler}. Type of 'handler' must be a function.`
      )
    }

    const selector = createConversationUpdateSelector(event)
    this.addRoute(selector, handler)
    return this
  }

  /**
     * @private
     * Starts a new "proactive" session with a conversation the bot is already a member of.
     * @remarks
     * Use of the method requires configuration of the Application with the `adapter.appId`
     * options. An exception will be thrown if either is missing.
     * @param context Context of the conversation to proactively message. This can be derived from either a TurnContext, ConversationReference, or Activity.
     * @param logic The bot's logic that should be run using the new proactive turn context.
     */
  private continueConversationAsync (
    context: TurnContext,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void>
  private continueConversationAsync (
    conversationReference: Partial<ConversationReference>,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void>
  private async continueConversationAsync (
    context: TurnContext,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void> {
    if (!this._adapter) {
      throw new Error(
        'You must configure the Application with an \'adapter\' before calling Application.continueConversationAsync()'
      )
    }

    if (!this.options.botAppId) {
      console.warn(
        'Calling Application.continueConversationAsync() without a configured \'botAppId\'. In production environments a \'botAppId\' is required.'
      )
    }

    // Identify conversation reference
    const reference = context.activity.getConversationReference()
    await this.adapter.continueConversation(reference, logic)
  }

  /**
     * Handles incoming messages with a given keyword.
     * @remarks
     * This method provides a simple way to have a bot respond anytime a user sends your bot a
     * message with a specific word or phrase.
     *
     * For example, you can easily clear the current conversation anytime a user sends "/reset":
     *
     * ```JavaScript
     * bot.message('/reset', async (context, state) => {
     *     await state.conversation.delete();
     *     await context.sendActivity(`I have reset your state.`);
     * });
     * ```
     * @param {string | RegExp | RouteSelector | string[] | RegExp[] | RouteSelector[]} keyword Substring of text or a regular expression to match against the text of an incoming message. An array of keywords or expression can also be passed in.
     * @param {(context: TurnContext, state: TState) => Promise<void>} handler Function to call when the route is triggered.
     * @returns {this} The application instance for chaining purposes.
     */
  public message (
    keyword: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    (Array.isArray(keyword) ? keyword : [keyword]).forEach((k) => {
      const selector = createMessageSelector(k)
      this.addRoute(selector, handler)
    })
    return this
  }

  /**
     * Dispatches an incoming activity to a handler registered with the application.
     * @remarks
     * This method should be called from your bot's "turn handler" (its primary message handler)
     *
     * ```JavaScript
     * server.post('/api/messages', async (req, res) => {
     *    await adapter.processActivity(req, res, async (context) => {
     *      await bot.run(context);
     *   });
     * });
     * ```
     * @param {TurnContext} turnContext Context class for the current turn of conversation with the user.
     * @returns {Promise<boolean>} True if the activity was successfully dispatched to a handler. False if no matching handlers could be found.
     */
  public async run (turnContext: TurnContext): Promise<boolean> {
    return await this.startLongRunningCall(turnContext, async (context) => {
      // Start typing indicator timer
      this.startTypingTimer(context)
      try {
        // Load turn state
        const { storage, turnStateFactory } = this._options
        const state = turnStateFactory()
        await state.load(context, storage)

        // Call beforeTurn event handlers
        if (!(await this.callEventHandlers(context, state, this._beforeTurn))) {
          // Save turn state
          // - This lets the bot keep track of why it ended the previous turn. It also
          //   allows the dialog system to be used before the AI system is called.
          await state.save(context, storage)
          return false
        }

        // Populate {{$temp.input}}
        if (typeof state.temp.input !== 'string') {
          // Use the received activity text
          state.temp.input = context.activity.text ?? ''
        }

        // Download any input files
        if (Array.isArray(this._options.fileDownloaders) && this._options.fileDownloaders.length > 0) {
          const inputFiles = state.temp.inputFiles ?? []
          for (let i = 0; i < this._options.fileDownloaders.length; i++) {
            const files = await this._options.fileDownloaders[i].downloadFiles(context, state)
            inputFiles.push(...files)
          }
          state.temp.inputFiles = inputFiles
        }

        // Initialize {{$allOutputs}}
        if (state.temp.actionOutputs === undefined) {
          state.temp.actionOutputs = {}
        }

        // All other ActivityTypes and any unhandled Invokes are run through the remaining routes.
        for (let i = 0; i < this._routes.length; i++) {
          const route = this._routes[i]
          if (await route.selector(context)) {
            // Execute route handler
            await route.handler(context, state)

            // Call afterTurn event handlers
            if (await this.callEventHandlers(context, state, this._afterTurn)) {
              // Save turn state
              await state.save(context, storage)
            }

            // End dispatch
            return true
          }
        }

        // Call afterTurn event handlers
        if (await this.callEventHandlers(context, state, this._afterTurn)) {
          // Save turn state
          await state.save(context, storage)
        }

        // activity wasn't handled
        return false
      } finally {
        this.stopTypingTimer()
      }
    })
  }

  /**
     * Sends a proactive activity to an existing conversation the bot is a member of.
     * @remarks
     * This method provides a simple way to send a proactive message to a conversation the bot is a member of.
     *
     * Use of the method requires you configure the Application with the `adapter.appId`
     * options. An exception will be thrown if either is missing.
     * @param context Context of the conversation to proactively message. This can be derived from either a TurnContext, ConversationReference, or Activity.
     * @param activityOrText Activity or message to send to the conversation.
     * @param speak Optional. Text to speak for channels that support voice.
     * @param inputHint Optional. Input hint for channels that support voice.
     * @returns A Resource response containing the ID of the activity that was sent.
     */
  public sendProactiveActivity (
    context: TurnContext,
    activityOrText: string | Activity,
    speak?: string,
    inputHint?: string
  ): Promise<ResourceResponse | undefined>
  public sendProactiveActivity (
    conversationReference: ConversationReference,
    activityOrText: string | Activity,
    speak?: string,
    inputHint?: string
  ): Promise<ResourceResponse | undefined>
  public sendProactiveActivity (
    activity: Activity,
    activityOrText: string | Activity,
    speak?: string,
    inputHint?: string
  ): Promise<ResourceResponse | undefined>
  public async sendProactiveActivity (
    context: TurnContext | ConversationReference | Activity,
    activityOrText: string | Activity,
    speak?: string,
    inputHint?: string
  ): Promise<ResourceResponse | undefined> {
    let response: ResourceResponse | undefined
    await this.continueConversationAsync(context, async (ctx) => {
      response = await ctx.sendActivity(activityOrText, speak, inputHint)
    })

    return response
  }

  /**
     * Manually start a timer to periodically send "typing" activities.
     * @remarks
     * The timer waits 1000ms to send its initial "typing" activity and then send an additional
     * "typing" activity every 1000ms. The timer will automatically end once an outgoing activity
     * has been sent. If the timer is already running or the current activity, is not a "message"
     * the call is ignored.
     * @param {TurnContext} context The context for the current turn with the user.
     */
  public startTypingTimer (context: TurnContext): void {
    if (context.activity.type === ActivityTypes.Message && !this._typingTimer) {
      // Listen for outgoing activities
      context.onSendActivities((context, activities, next) => {
        // Listen for any messages to be sent from the bot
        if (timerRunning) {
          for (let i = 0; i < activities.length; i++) {
            if (activities[i].type === ActivityTypes.Message || activities[i].channelData?.streamType) {
              // Stop the timer
              this.stopTypingTimer()
              timerRunning = false
              break
            }
          }
        }

        return next()
      })

      let timerRunning = true
      const onTimeout = async () => {
        try {
          // Send typing activity
          await context.sendActivity(Activity.fromObject({ type: ActivityTypes.Typing }))
        } catch (err) {
          // Seeing a random proxy violation error from the context object. This is because
          // we're in the middle of sending an activity on a background thread when the turn ends.
          // The context object throws when we try to update "this.responded = true". We can just
          // eat the error but lets make sure our states cleaned up a bit.
          this._typingTimer = undefined
          timerRunning = false
        }

        // Restart timer
        if (timerRunning) {
          this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
        }
      }
      this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
    }
  }

  /**
     * Manually stop the typing timer.
     * @remarks
     * If the timer isn't running nothing happens.
     */
  public stopTypingTimer (): void {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer)
      this._typingTimer = undefined
    }
  }

  /**
     * Registers a turn event handler.
     * @remarks
     * Turn events let you do something before or after a turn is run. Returning false from
     * `beforeTurn` lets you prevent the turn from running and returning false from `afterTurn`
     * lets you prevent the bots state from being saved.
     *
     * Returning false from `beforeTurn` does result in the bots state being saved which lets you
     * track the reason why the turn was not processed. It also means you can use `beforeTurn` as
     * a way to call into the dialog system. For example, you could use the OAuthPrompt to sign the
     * user in before allowing the AI system to run.
     * @param {TurnEvents | TurnEvents[]} event - Name of the turn event to handle.
     * @param {(context: TurnContext, state: TState) => Promise<boolean>} handler - Function to call when the event is triggered.
     * @returns {this} The application instance for chaining purposes.
     */
  public turn (
    event: TurnEvents | TurnEvents[],
    handler: (context: TurnContext, state: TState) => Promise<boolean>
  ): this {
    (Array.isArray(event) ? event : [event]).forEach((e) => {
      switch (event) {
        case 'beforeTurn':
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
     * Calls the given event handlers with the given context and state.
     * @param {TurnContext} context - The context for the current turn with the user.
     * @param {TState} state - The current state of the conversation.
     * @param {ApplicationEventHandler<TState>[]} handlers - The event handlers to call.
     * @returns {Promise<boolean>} A Promise that resolves to a boolean indicating whether the event handlers completed successfully.
     * @private
     */
  private async callEventHandlers (
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

    // Continue execution
    return true
  }

  /**
     * Calls the given handler with the given context, either directly or by continuing the conversation
     * if the message is a long-running message.
     * @param {TurnContext} context - The context for the current turn with the user.
     * @param {(context: TurnContext) => Promise<boolean>} handler - The handler function to call.
     * @returns {Promise<boolean>} A Promise that resolves to a boolean indicating whether the handler completed successfully.
     * @private
     */
  private startLongRunningCall (
    context: TurnContext,
    handler: (context: TurnContext) => Promise<boolean>
  ): Promise<boolean> {
    /**
         * If the message is a long-running message, continue the conversation
         * and call the handler with the new context.
         */
    if (context.activity.type === ActivityTypes.Message && this._options.longRunningMessages) {
      return new Promise<boolean>((resolve, reject) => {
        this.continueConversationAsync(context, async (ctx) => {
          try {
            // Copy original activity to new context
            for (const key in context.activity) {
              (ctx.activity as any)[key] = (context.activity as any)[key]
            }

            // Call handler
            const result = await handler(ctx)
            resolve(result)
          } catch (err) {
            reject(err)
          }
        })
      })
    } else {
      // Call handler directly
      return handler(context)
    }
  }
}

/**
 * @private
 */
interface AppRoute<TState extends TurnState> {
  selector: RouteSelector;
  handler: RouteHandler<TState>;
}

/**
 * @param {string | RegExp | RouteSelector} type The type of activity to match. Can be a string, RegExp, or RouteSelector function.
 * @returns {RouteSelector} A RouteSelector function that matches the given activity type.
 * @private
 */
function createActivitySelector (type: string | RegExp | RouteSelector): RouteSelector {
  if (typeof type === 'function') {
    // Return the passed in selector function
    return type
  } else if (type instanceof RegExp) {
    // Return a function that matches the activities type using a RegExp
    return (context: TurnContext) => {
      return Promise.resolve(context?.activity?.type ? type.test(context.activity.type) : false)
    }
  } else {
    // Return a function that attempts to match type name
    const typeName = type.toString().toLocaleLowerCase()
    return (context: TurnContext) => {
      return Promise.resolve(
        context?.activity?.type ? context.activity.type.toLocaleLowerCase() === typeName : false
      )
    }
  }
}

/**
 * Creates a route selector function that matches a conversation update event.
 * @param {ConversationUpdateEvents} event The conversation update event to match against.
 * @returns {RouteSelector} A route selector function that returns true if the activity is a conversation update event and matches the specified event type.
 * @private
 */
function createConversationUpdateSelector (event: ConversationUpdateEvents): RouteSelector {
  switch (event) {
    case 'membersAdded':
      /**
             * @param {TurnContext} context The context object for the current turn of conversation.
             * @returns {Promise<boolean>} A Promise that resolves to a boolean indicating whether the activity is a conversation update event with members added.
             */
      return (context: TurnContext): Promise<boolean> => {
        return Promise.resolve(
          context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        Array.isArray(context?.activity?.membersAdded) &&
                        context.activity.membersAdded.length > 0
        )
      }
    case 'membersRemoved':
      /**
             * @param {TurnContext} context The context object for the current turn of conversation.
             * @returns {Promise<boolean>} A Promise that resolves to a boolean indicating whether the activity is a conversation update event with members removed.
             */
      return (context: TurnContext): Promise<boolean> => {
        return Promise.resolve(
          context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        Array.isArray(context?.activity?.membersRemoved) &&
                        context.activity.membersRemoved.length > 0
        )
      }
    default:
      /**
             * @param {TurnContext} context The context object for the current turn of conversation.
             * @returns {Promise<boolean>} A Promise that resolves to a boolean indicating whether the activity is a conversation update event with the specified event type.
             */
      return (context: TurnContext): Promise<boolean> => {
        return Promise.resolve(
          context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        context?.activity?.channelData?.eventType === event
        )
      }
  }
}

/**
 * Creates a route selector function that matches a message based on a keyword.
 * @param {string | RegExp | RouteSelector} keyword The keyword to match against the message text. Can be a string, regular expression, or a custom selector function.
 * @returns {RouteSelector} A route selector function that returns true if the message text matches the keyword.
 * @private
 */
function createMessageSelector (keyword: string | RegExp | RouteSelector): RouteSelector {
  if (typeof keyword === 'function') {
    // Return the passed in selector function
    return keyword
  } else if (keyword instanceof RegExp) {
    // Return a function that matches a messages text using a RegExp
    return (context: TurnContext) => {
      if (context?.activity?.type === ActivityTypes.Message && context.activity.text) {
        return Promise.resolve(keyword.test(context.activity.text))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    // Return a function that attempts to match a messages text using a substring
    const k = keyword.toString().toLocaleLowerCase()
    return (context: TurnContext) => {
      if (context?.activity?.type === ActivityTypes.Message && context.activity.text) {
        return Promise.resolve(context.activity.text.toLocaleLowerCase().indexOf(k) >= 0)
      } else {
        return Promise.resolve(false)
      }
    }
  }
}

/**
 * @private
 */
type ApplicationEventHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<boolean>
