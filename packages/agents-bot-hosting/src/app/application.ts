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

export class Application<TState extends TurnState = TurnState> {
  private readonly _options: ApplicationOptions<TState>
  private readonly _routes: AppRoute<TState>[] = []
  private readonly _beforeTurn: ApplicationEventHandler<TState>[] = []
  private readonly _afterTurn: ApplicationEventHandler<TState>[] = []
  private readonly _adapter?: BotAdapter
  private _typingTimer: any

  public constructor (options?: Partial<ApplicationOptions<TState>>) {
    this._options = {
      ...options,
      turnStateFactory: options?.turnStateFactory || (() => new TurnState() as TState),
      startTypingTimer: options?.startTypingTimer !== undefined ? options.startTypingTimer : true,
      longRunningMessages: options?.longRunningMessages !== undefined ? options.longRunningMessages : false
    }

    if (this._options.adapter) {
      this._adapter = this._options.adapter
    }

    if (this._options.longRunningMessages && !this._adapter && !this._options.botAppId) {
      throw new Error(
        'The Application.longRunningMessages property is unavailable because no adapter or botAppId was configured.'
      )
    }
  }

  public get adapter (): BotAdapter {
    if (!this._adapter) {
      throw new Error(
        'The Application.adapter property is unavailable because it was not configured when creating the Application.'
      )
    }

    return this._adapter
  }

  public get options (): ApplicationOptions<TState> {
    return this._options
  }

  public error (handler: (context: TurnContext, error: Error) => Promise<void>): this {
    if (this._adapter) {
      this._adapter.onTurnError = handler
    }

    return this
  }

  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>): this {
    this._routes.push({ selector, handler })
    return this
  }

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

    const reference = context.activity.getConversationReference()
    await this.adapter.continueConversation(reference, logic)
  }

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

  public async run (turnContext: TurnContext): Promise<boolean> {
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
      } finally {
        this.stopTypingTimer()
      }
    })
  }

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

  public startTypingTimer (context: TurnContext): void {
    if (context.activity.type === ActivityTypes.Message && !this._typingTimer) {
      context.onSendActivities((context, activities, next) => {
        if (timerRunning) {
          for (let i = 0; i < activities.length; i++) {
            if (activities[i].type === ActivityTypes.Message || activities[i].channelData?.streamType) {
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
          await context.sendActivity(Activity.fromObject({ type: ActivityTypes.Typing }))
        } catch (err) {
          this._typingTimer = undefined
          timerRunning = false
        }

        if (timerRunning) {
          this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
        }
      }
      this._typingTimer = setTimeout(onTimeout, TYPING_TIMER_DELAY)
    }
  }

  public stopTypingTimer (): void {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer)
      this._typingTimer = undefined
    }
  }

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

    return true
  }

  private startLongRunningCall (
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
          } catch (err) {
            reject(err)
          }
        })
      })
    } else {
      return handler(context)
    }
  }
}

interface AppRoute<TState extends TurnState> {
  selector: RouteSelector;
  handler: RouteHandler<TState>;
}

function createActivitySelector (type: string | RegExp | RouteSelector): RouteSelector {
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

function createConversationUpdateSelector (event: ConversationUpdateEvents): RouteSelector {
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

function createMessageSelector (keyword: string | RegExp | RouteSelector): RouteSelector {
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

type ApplicationEventHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<boolean>
