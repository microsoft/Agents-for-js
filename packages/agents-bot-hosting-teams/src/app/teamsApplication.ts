/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityTypes, AgentApplication, AppRoute, debug, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-bot-hosting'
import { TeamsApplicationOptions } from './teamsApplicationOptions'
import { RouteHandler } from '@microsoft/agents-bot-hosting/dist/src/app/routeHandler'
import { AdaptiveCards } from './adaptiveCards'
import { Messages } from './messages'
import { MessageExtensions } from './messageExtensions'
import { Meetings } from './meetings'
import { TaskModules } from './taskModules'

const logger = debug('agents:teams-application')

export class TeamsApplication<TState extends TurnState> extends AgentApplication<TState> {
  private readonly _teamsOptions: TeamsApplicationOptions<TState>
  private readonly _invokeRoutes: AppRoute<TState>[] = []
  private readonly _adaptiveCards: AdaptiveCards<TState>
  private readonly _messages: Messages<TState>
  private readonly _messageExtensions: MessageExtensions<TState>
  private readonly _meetings: Meetings<TState>
  private readonly _taskModules: TaskModules<TState>

  public constructor (options?: Partial<TeamsApplicationOptions<TState>>) {
    super()
    this._teamsOptions = {
      ...super.options,
      removeRecipientMention:
                options?.removeRecipientMention !== undefined ? options.removeRecipientMention : true
    }

    this._adaptiveCards = new AdaptiveCards<TState>(this)
    this._messages = new Messages<TState>(this)
    this._messageExtensions = new MessageExtensions<TState>(this)
    this._meetings = new Meetings<TState>(this)
    this._taskModules = new TaskModules<TState>(this)
  }

  public get teamsOptions (): TeamsApplicationOptions<TState> {
    return this._teamsOptions
  }

  public get taskModules (): TaskModules<TState> {
    return this._taskModules
  }

  public get adaptiveCards (): AdaptiveCards<TState> {
    return this._adaptiveCards
  }

  public get messages (): Messages<TState> {
    return this._messages
  }

  public get messageExtensions (): MessageExtensions<TState> {
    return this._messageExtensions
  }

  public get meetings (): Meetings<TState> {
    return this._meetings
  }

  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>, isInvokeRoute = false): this {
    if (isInvokeRoute) {
      this._invokeRoutes.push({ selector, handler })
    } else {
      this._routes.push({ selector, handler })
    }
    return this
  }

  public async run (turnContext: TurnContext): Promise<boolean> {
    return await this.startLongRunningCall(turnContext, async (context) => {
      this.startTypingTimer(context)
      try {
        if (this._teamsOptions.removeRecipientMention && context.activity.type === ActivityTypes.Message) {
          context.activity.text = context.activity.removeRecipientMention()
        }

        const { storage, turnStateFactory } = this._teamsOptions
        const state = turnStateFactory()
        await state.load(context, storage)

        if (!(await this.callEventHandlers(context, state, this._beforeTurn))) {
          await state.save(context, storage)
          return false
        }

        if (typeof state.temp.input !== 'string') {
          state.temp.input = context.activity.text ?? ''
        }

        if (Array.isArray(this._teamsOptions.fileDownloaders) && this._teamsOptions.fileDownloaders.length > 0) {
          const inputFiles = state.temp.inputFiles ?? []
          for (let i = 0; i < this._teamsOptions.fileDownloaders.length; i++) {
            const files = await this._teamsOptions.fileDownloaders[i].downloadFiles(context, state)
            inputFiles.push(...files)
          }
          state.temp.inputFiles = inputFiles
        }

        if (state.temp.actionOutputs === undefined) {
          state.temp.actionOutputs = {}
        }

        if (context.activity.type === ActivityTypes.Invoke) {
          for (let i = 0; i < this._invokeRoutes.length; i++) {
            const route = this._invokeRoutes[i]
            if (await route.selector(context)) {
              await route.handler(context, state)

              if (await this.callEventHandlers(context, state, this._afterTurn)) {
                await state.save(context, storage)
              }

              return true
            }
          }
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
}
