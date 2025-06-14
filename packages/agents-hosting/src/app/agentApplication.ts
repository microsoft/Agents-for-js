/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { BaseAdapter } from '../baseAdapter'
import { ResourceResponse } from '../connector-client'
import { debug } from '../logger'
import { TurnContext } from '../turnContext'
import { AdaptiveCardsActions } from './adaptiveCards'
import { AgentApplicationOptions } from './agentApplicationOptions'
import { AppRoute } from './appRoute'
import { ConversationUpdateEvents } from './conversationUpdateEvents'
import { AgentExtension } from './extensions'
import { Authorization } from './oauth/authorization'
import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnEvents } from './turnEvents'
import { TurnState } from './turnState'

const logger = debug('agents:agent-application')

const TYPING_TIMER_DELAY = 1000
export type ApplicationEventHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<boolean>

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
 * Example usage:
 * ```typescript
 * const app = new AgentApplication();
 * await app.run(turnContext);
 * ```
 */
export class AgentApplication<TState extends TurnState> {
  protected readonly _options: AgentApplicationOptions<TState>
  protected readonly _routes: AppRoute<TState>[] = []
  protected readonly _beforeTurn: ApplicationEventHandler<TState>[] = []
  protected readonly _afterTurn: ApplicationEventHandler<TState>[] = []
  private readonly _adapter?: BaseAdapter
  private readonly _authorization?: Authorization
  private _typingTimer: NodeJS.Timeout | undefined
  protected readonly _extensions: AgentExtension<TState>[] = []
  private readonly _adaptiveCards: AdaptiveCardsActions<TState>

  public constructor (options?: Partial<AgentApplicationOptions<TState>>) {
    this._options = {
      ...options,
      turnStateFactory: options?.turnStateFactory || (() => new TurnState() as TState),
      startTypingTimer: options?.startTypingTimer !== undefined ? options.startTypingTimer : false,
      longRunningMessages: options?.longRunningMessages !== undefined ? options.longRunningMessages : false,
      removeRecipientMention: options?.removeRecipientMention !== undefined ? options.removeRecipientMention : true,
    }

    this._adaptiveCards = new AdaptiveCardsActions<TState>(this)

    if (this._options.adapter) {
      this._adapter = this._options.adapter
    }

    if (this._options.authorization) {
      this._authorization = new Authorization(this._options.storage!, this._options.authorization)
    }

    if (this._options.longRunningMessages && !this._adapter && !this._options.agentAppId) {
      throw new Error('The Application.longRunningMessages property is unavailable because no adapter was configured in the app.')
    }
  }

  /**
   * Gets the adapter associated with the application.
   * @throws Error if the adapter is not configured.
   */
  public get adapter (): BaseAdapter {
    return this._adapter!
  }

  /**
   * Gets the authorization instance for the application.
   * @throws Error if no authentication options were configured.
   */
  public get authorization (): Authorization {
    if (!this._authorization) {
      throw new Error('The Application.authorization property is unavailable because no authorization options were configured.')
    }
    return this._authorization
  }

  /**
   * Gets the options used to configure the application.
   * @returns The application options.
   */
  public get options (): AgentApplicationOptions<TState> {
    return this._options
  }

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
   * Example usage:
   * ```typescript
   * app.onError(async (context, error) => {
   *   console.error(`An error occurred: ${error.message}`);
   *   await context.sendActivity('Sorry, something went wrong!');
   * });
   * ```
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
   * @returns The current instance of the application.
   *
   * @remarks
   * Routes are evaluated in the order they are added. The first route with a selector that returns true will be used.
   *
   * Example usage:
   * ```typescript
   * app.addRoute(
   *   async (context) => context.activity.type === ActivityTypes.Message,
   *   async (context, state) => {
   *     await context.sendActivity('I received your message');
   *   }
   * );
   * ```
   */
  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>, isInvokeRoute: boolean = false): this {
    this._routes.push({ selector, handler, isInvokeRoute })
    return this
  }

  /**
   * Adds a handler for specific activity types.
   *
   * @param type - The activity type(s) to handle. Can be a string, RegExp, RouteSelector, or array of these types.
   * @param handler - The handler function that will be called when the specified activity type is received.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method allows you to register handlers for specific activity types such as 'message', 'conversationUpdate', etc.
   * You can specify multiple activity types by passing an array.
   *
   * Example usage:
   * ```typescript
   * app.onActivity(ActivityTypes.Message, async (context, state) => {
   *   await context.sendActivity('I received your message');
   * });
   * ```
   */
  public onActivity (
    type: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    (Array.isArray(type) ? type : [type]).forEach((t) => {
      const selector = this.createActivitySelector(t)
      this.addRoute(selector, handler)
    })
    return this
  }

  /**
   * Adds a handler for conversation update events.
   *
   * @param event - The conversation update event to handle (e.g., 'membersAdded', 'membersRemoved').
   * @param handler - The handler function that will be called when the specified event occurs.
   * @returns The current instance of the application.
   * @throws Error if the handler is not a function.
   *
   * @remarks
   * Conversation update events occur when the state of a conversation changes, such as when members join or leave.
   *
   * Example usage:
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
   */
  public onConversationUpdate (
    event: ConversationUpdateEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    if (typeof handler !== 'function') {
      throw new Error(
                `ConversationUpdate 'handler' for ${event} is ${typeof handler}. Type of 'handler' must be a function.`
      )
    }

    const selector = this.createConversationUpdateSelector(event)
    this.addRoute(selector, handler)
    return this
  }

  /**
   * Continues a conversation asynchronously.
   * @param conversationReferenceOrContext - The conversation reference or turn context.
   * @param logic - The logic to execute during the conversation.
   * @returns A promise that resolves when the conversation logic has completed.
   * @throws Error if the adapter is not configured.
   */
  protected async continueConversationAsync (
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

    await this._adapter.continueConversation(reference, logic)
  }

  /**
   * Adds a handler for message activities that match the specified keyword or pattern.
   *
   * @param keyword - The keyword, pattern, or selector function to match against message text.
   *                  Can be a string, RegExp, RouteSelector, or array of these types.
   * @param handler - The handler function that will be called when a matching message is received.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method allows you to register handlers for specific message patterns.
   * If keyword is a string, it matches messages containing that string.
   * If keyword is a RegExp, it tests the message text against the regular expression.
   * If keyword is a function, it calls the function with the context to determine if the message matches.
   *
   * Example usage:
   * ```typescript
   * app.onMessage('hello', async (context, state) => {
   *   await context.sendActivity('Hello there!');
   * });
   *
   * app.onMessage(/help., async (context, state) => {
   *   await context.sendActivity('How can I help you?');
   * });
   * ```
   */
  public onMessage (
    keyword: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    (Array.isArray(keyword) ? keyword : [keyword]).forEach((k) => {
      const selector = this.createMessageSelector(k)
      this.addRoute(selector, handler)
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
   * Example usage:
   * ```typescript
   * app.onSignInSuccess(async (context, state) => {
   *   await context.sendActivity('You have successfully signed in!');
   * });
   * ```
   */
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, id?: string) => void): this {
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
   * Adds a handler for message reaction added events.
   *
   * @param handler - The handler function that will be called when a message reaction is added.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method registers a handler that will be invoked when a user adds a reaction to a message,
   * such as a like, heart, or other emoji reaction.
   *
   * Example usage:
   * ```typescript
   * app.onMessageReactionAdded(async (context, state) => {
   *   const reactionsAdded = context.activity.reactionsAdded;
   *   if (reactionsAdded && reactionsAdded.length > 0) {
   *     await context.sendActivity(`Thanks for your ${reactionsAdded[0].type} reaction!`);
   *   }
   * });
   * ```
   */
  public onMessageReactionAdded (handler: (context: TurnContext, state: TState) => Promise<void>): this {
    const selector = async (context: TurnContext): Promise<boolean> => {
      return context.activity.type === ActivityTypes.MessageReaction &&
             Array.isArray(context.activity.reactionsAdded) &&
             context.activity.reactionsAdded.length > 0
    }

    this.addRoute(selector, handler)
    return this
  }

  /**
   * Adds a handler for message reaction removed events.
   *
   * @param handler - The handler function that will be called when a message reaction is removed.
   * @returns The current instance of the application.
   *
   * @remarks
   * This method registers a handler that will be invoked when a user removes a reaction from a message,
   * such as unliking or removing an emoji reaction.
   *
   * Example usage:
   * ```typescript
   * app.onMessageReactionRemoved(async (context, state) => {
   *   const reactionsRemoved = context.activity.reactionsRemoved;
   *   if (reactionsRemoved && reactionsRemoved.length > 0) {
   *     await context.sendActivity(`You removed your ${reactionsRemoved[0].type} reaction.`);
   *   }
   * });
   * ```
   */
  public onMessageReactionRemoved (handler: (context: TurnContext, state: TState) => Promise<void>): this {
    const selector = async (context: TurnContext): Promise<boolean> => {
      return context.activity.type === ActivityTypes.MessageReaction &&
             Array.isArray(context.activity.reactionsRemoved) &&
             context.activity.reactionsRemoved.length > 0
    }

    this.addRoute(selector, handler)
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
   * Example usage:
   * ```typescript
   * const app = new AgentApplication();
   * await app.run(turnContext);
   * ```
   */
  public async run (turnContext:TurnContext): Promise<void> {
    await this.runInternal(turnContext)
  }

  /**
   * Executes the application logic for a given turn context.
   * @private
   * @param turnContext - The context for the current turn of the conversation.
   * @returns A promise that resolves to true if a handler was executed, false otherwise.
   *
   * @remarks
   * This method is the core logic for processing a turn in the conversation.
   * It handles routing and executing handlers based on the activity type and content.
   */
  public async runInternal (turnContext: TurnContext): Promise<boolean> {
    return await this.startLongRunningCall(turnContext, async (context) => {
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

        if (!(await this.callEventHandlers(context, state, this._beforeTurn))) {
          await state.save(context, storage)
          return false
        }

        if (Array.isArray(this._options.fileDownloaders) && this._options.fileDownloaders.length > 0) {
          const inputFiles = state.temp.inputFiles ?? []
          for (let i = 0; i < this._options.fileDownloaders.length; i++) {
            const files = await this._options.fileDownloaders[i].downloadFiles(context, state)
            inputFiles.push(...files)
          }
          state.temp.inputFiles = inputFiles
        }

        for (let i = 0; i < this._routes.length; i++) {
          const route = this._routes[i]
          if (await route.selector(context)) {
            await route.handler(context, state)

            if (await this.callEventHandlers(context, state, this._afterTurn)) {
              await state.save(context, storage)
            }

            return true
          }
        }

        if (await this.callEventHandlers(context, state, this._afterTurn)) {
          await state.save(context, storage)
        }

        return false
      } catch (err: any) {
        logger.error(err)
        throw err
      } finally {
        this.stopTypingTimer()
      }
    })
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
   * Example usage:
   * ```typescript
   * // With conversation reference
   * await app.sendProactiveActivity(conversationReference, 'Important notification!');
   *
   * // From an existing context
   * await app.sendProactiveActivity(turnContext, 'Important notification!');
   * ```
   */
  public async sendProactiveActivity (
    context: TurnContext | ConversationReference,
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
   * Example usage:
   * ```typescript
   * app.startTypingTimer(turnContext);
   * // Do some processing...
   * await turnContext.sendActivity('Response after processing');
   * // Typing timer automatically stops when sending a message
   * ```
   */
  public startTypingTimer (context: TurnContext): void {
    if (context.activity.type === ActivityTypes.Message && !this._typingTimer) {
      let timerRunning = true
      context.onSendActivities(async (context, activities, next) => {
        if (timerRunning) {
          for (let i = 0; i < activities.length; i++) {
            if (activities[i].type === ActivityTypes.Message || activities[i].channelData?.streamType) {
              this.stopTypingTimer()
              timerRunning = false
              await lastSend
              break
            }
          }
        }

        return next()
      })

      let lastSend: Promise<any> = Promise.resolve()
      const onTimeout = async () => {
        try {
          lastSend = context.sendActivity(Activity.fromObject({ type: ActivityTypes.Typing }))
          await lastSend
        } catch (err: any) {
          logger.error(err)
          this._typingTimer = undefined
          timerRunning = false
          lastSend = Promise.resolve()
        }

        if (timerRunning) {
          this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
        }
      }
      this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
    }
  }

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
   * This method clears the typing indicator timer to prevent further typing indicators
   * from being sent. It's typically called automatically when a message is sent, but
   * can also be called manually to stop the typing indicator.
   *
   * Example usage:
   * ```typescript
   * app.startTypingTimer(turnContext);
   * // Do some processing...
   * app.stopTypingTimer(); // Manually stop the typing indicator
   * ```
   */
  public stopTypingTimer (): void {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer)
      this._typingTimer = undefined
    }
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
   * Example usage:
   * ```typescript
   * app.onTurn('beforeTurn', async (context, state) => {
   *   console.log('Processing before turn');
   *   return true; // Continue execution
   * });
   * ```
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

  protected startLongRunningCall (
    context: TurnContext,
    handler: (context: TurnContext) => Promise<boolean>
  ): Promise<boolean> {
    if (context.activity.type === ActivityTypes.Message && this._options.longRunningMessages) {
      return new Promise<boolean>((resolve, reject) => {
        this.continueConversationAsync(context, async (ctx) => {
          try {
            for (const key in context.activity) {
              (ctx.activity as any)[key] = (context.activity as any)[key]
            }

            const result = await handler(ctx)
            resolve(result)
          } catch (err: any) {
            logger.error(err)
            reject(err)
          }
        })
      })
    } else {
      return handler(context)
    }
  }

  private createActivitySelector (type: string | RegExp | RouteSelector): RouteSelector {
    if (typeof type === 'function') {
      return type
    } else if (type instanceof RegExp) {
      return (context: TurnContext) => {
        return Promise.resolve(context?.activity?.type ? type.test(context.activity.type) : false)
      }
    } else {
      const typeName = type.toString().toLocaleLowerCase()
      return (context: TurnContext) => {
        return Promise.resolve(
          context?.activity?.type ? context.activity.type.toLocaleLowerCase() === typeName : false
        )
      }
    }
  }

  private createConversationUpdateSelector (event: ConversationUpdateEvents): RouteSelector {
    switch (event) {
      case 'membersAdded':
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          Array.isArray(context?.activity?.membersAdded) &&
                          context.activity.membersAdded.length > 0
          )
        }
      case 'membersRemoved':
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          Array.isArray(context?.activity?.membersRemoved) &&
                          context.activity.membersRemoved.length > 0
          )
        }
      default:
        return (context: TurnContext): Promise<boolean> => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                          context?.activity?.channelData?.eventType === event
          )
        }
    }
  }

  private createMessageSelector (keyword: string | RegExp | RouteSelector): RouteSelector {
    if (typeof keyword === 'function') {
      return keyword
    } else if (keyword instanceof RegExp) {
      return (context: TurnContext) => {
        if (context?.activity?.type === ActivityTypes.Message && context.activity.text) {
          return Promise.resolve(keyword.test(context.activity.text))
        } else {
          return Promise.resolve(false)
        }
      }
    } else {
      const k = keyword.toString().toLocaleLowerCase()
      return (context: TurnContext) => {
        if (context?.activity?.type === ActivityTypes.Message && context.activity.text) {
          return Promise.resolve(context.activity.text.toLocaleLowerCase() === k)
        } else {
          return Promise.resolve(false)
        }
      }
    }
  }
}
