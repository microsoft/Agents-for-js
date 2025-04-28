/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { TurnState } from './turnState'
import { BaseAdapter } from '../baseAdapter'
import { AgentApplicationOptions } from './agentApplicationOptions'
import { RouteSelector } from './routeSelector'
import { RouteHandler } from './routeHandler'
import { ConversationUpdateEvents } from './conversationUpdateEvents'
import { TurnEvents } from './turnEvents'
import { AppRoute } from './appRoute'
import { TurnContext } from '../turnContext'
import { ResourceResponse } from '../connector-client'
import { debug } from '../logger'
import { UserIdentity } from './oauth/userIdentity'
import { MemoryStorage } from '../storage'

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
  private _typingTimer: any
  private readonly _userIdentity?: UserIdentity

  public constructor (options?: Partial<AgentApplicationOptions<TState>>) {
    this._options = {
      ...options,
      turnStateFactory: options?.turnStateFactory || (() => new TurnState() as TState),
      startTypingTimer: options?.startTypingTimer !== undefined ? options.startTypingTimer : true,
      longRunningMessages: options?.longRunningMessages !== undefined ? options.longRunningMessages : false
    }

    if (this._options.adapter) {
      this._adapter = this._options.adapter
    }

    if (this._options.authentication && this._options.authentication.enableSSO && this._options.authentication.ssoConnectionName) {
      this._userIdentity = new UserIdentity(this._options.storage ?? new MemoryStorage(), this._options.authentication.ssoConnectionName)
    }

    if (this._options.longRunningMessages && !this._adapter && !this._options.agentAppId) {
      throw new Error(
        'The Application.longRunningMessages property is unavailable because no adapter or agentAppId was configured.'
      )
    }
  }

  public get adapter (): BaseAdapter {
    if (!this._adapter) {
      throw new Error(
        'The Application.adapter property is unavailable because it was not configured when creating the Application.'
      )
    }

    return this._adapter
  }

  public get userIdentity (): UserIdentity {
    if (!this._userIdentity) {
      throw new Error(
        'The Application.authentication property is unavailable because no authentication options were configured.'
      )
    }

    return this._userIdentity
  }

  public get options (): AgentApplicationOptions<TState> {
    return this._options
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
   * app.error(async (context, error) => {
   *   console.error(`An error occurred: ${error.message}`);
   *   await context.sendActivity('Sorry, something went wrong!');
   * });
   * ```
   */
  public error (handler: (context: TurnContext, error: Error) => Promise<void>): this {
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
  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>): this {
    this._routes.push({ selector, handler })
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
   * app.activity(ActivityTypes.Message, async (context, state) => {
   *   await context.sendActivity('I received your message');
   * });
   * ```
   */
  public activity (
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
   * app.conversationUpdate('membersAdded', async (context, state) => {
   *   const membersAdded = context.activity.membersAdded;
   *   for (const member of membersAdded) {
   *     if (member.id !== context.activity.recipient.id) {
   *       await context.sendActivity('Hello and welcome!');
   *     }
   *   }
   * });
   * ```
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
   * app.message('hello', async (context, state) => {
   *   await context.sendActivity('Hello there!');
   * });
   *
   * app.message(/help., async (context, state) => {
   *   await context.sendActivity('How can I help you?');
   * });
   * ```
   */
  public message (
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
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState) => void): this {
    if (this._userIdentity) {
      this._userIdentity.onSignInSuccess(handler)
    } else {
      throw new Error(
        'The Application.authentication property is unavailable because no authentication options were configured.'
      )
    }
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
      this.startTypingTimer(context)
      try {
        const { storage, turnStateFactory } = this._options
        const state = turnStateFactory()
        await state.load(context, storage)

        if (!(await this.callEventHandlers(context, state, this._beforeTurn))) {
          await state.save(context, storage)
          return false
        }

        if (typeof state.temp.input !== 'string') {
          state.temp.input = context.activity.text ?? ''
        }

        if (Array.isArray(this._options.fileDownloaders) && this._options.fileDownloaders.length > 0) {
          const inputFiles = state.temp.inputFiles ?? []
          for (let i = 0; i < this._options.fileDownloaders.length; i++) {
            const files = await this._options.fileDownloaders[i].downloadFiles(context, state)
            inputFiles.push(...files)
          }
          state.temp.inputFiles = inputFiles
        }

        if (state.temp.actionOutputs === undefined) {
          state.temp.actionOutputs = {}
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
   * app.turn('beforeTurn', async (context, state) => {
   *   console.log('Processing before turn');
   *   return true; // Continue execution
   * });
   * ```
   */
  public turn (
    event: TurnEvents | TurnEvents[],
    handler: (context: TurnContext, state: TState) => Promise<boolean>
  ): this {
    (Array.isArray(event) ? event : [event]).forEach((e) => {
      switch (e) {
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
          return Promise.resolve(context.activity.text.toLocaleLowerCase().indexOf(k) >= 0)
        } else {
          return Promise.resolve(false)
        }
      }
    }
  }
}
