/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { AgentApplication, AppRoute, debug, MemoryStorage, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplicationOptions } from './teamsApplicationOptions'
import { FileConsentCardResponse } from '../file/fileConsentCardResponse'
import { ChannelInfo } from '../channel-data/channelInfo'
import { TeamsInfo } from '../teamsInfo'
import { TeamDetails } from '../connector-client/teamDetails'
import { TeamsPagedMembersResult } from '../connector-client/teamsPagedMembersResult'
import { ReadReceiptInfo } from '../message-read-info/readReceipInfo'
import { parseValueAction, parseValueContinuation } from '../parsers'
import { AdaptiveCardsActions } from './adaptive-cards-actions'
import { MessageReactionEvents, Messages, TeamsMessageEvents } from './messages'
import { MessageExtensions } from './messaging-extension'
import { Meetings } from './meeting'
import { TaskModules } from './task'
import { TeamsConversationUpdateEvents } from './conversation-events'
import { TeamsOAuthFlowAppStyle } from './oauth/teamsOAuthFlowAppStyle'

const logger = debug('agents:teams-application')

export class TeamsApplication<TState extends TurnState> extends AgentApplication<TState> {
  private readonly _teamsOptions: TeamsApplicationOptions<TState>
  private readonly _invokeRoutes: AppRoute<TState>[] = []
  private readonly _adaptiveCards: AdaptiveCardsActions<TState>
  private readonly _messages: Messages<TState>
  private readonly _messageExtensions: MessageExtensions<TState>
  private readonly _meetings: Meetings<TState>
  private readonly _taskModules: TaskModules<TState>
  private readonly _teamsAuthManager?: TeamsOAuthFlowAppStyle

  public constructor (options?: Partial<TeamsApplicationOptions<TState>>) {
    super()
    this._teamsOptions = {
      ...super.options,
      removeRecipientMention:
                options?.removeRecipientMention !== undefined ? options.removeRecipientMention : true,
      taskModules: options?.taskModules
    }

    if (options?.storage && options?.authentication && options?.authentication.enableSSO) {
      this._teamsAuthManager = new TeamsOAuthFlowAppStyle(options?.storage ?? new MemoryStorage())
    }

    this._adaptiveCards = new AdaptiveCardsActions<TState>(this)
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

  public get adaptiveCards (): AdaptiveCardsActions<TState> {
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

  public get teamsAuthManager (): TeamsOAuthFlowAppStyle {
    if (!this._teamsAuthManager) {
      throw new Error(
        'The Application.authentication property is unavailable because no authentication options were configured.'
      )
    }

    return this._teamsAuthManager
  }

  public addRoute (selector: RouteSelector, handler: RouteHandler<TState>, isInvokeRoute = false): this {
    if (isInvokeRoute) {
      this._invokeRoutes.push({ selector, handler })
    } else {
      this._routes.push({ selector, handler })
    }
    return this
  }

  public async run (turnContext: TurnContext): Promise<void> {
    await this.runInternalTeams(turnContext)
  }

  private async runInternalTeams (turnContext: TurnContext): Promise<boolean> {
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

  public conversationUpdate (
    event: TeamsConversationUpdateEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    if (typeof handler !== 'function') {
      throw new Error(
            `ConversationUpdate 'handler' for ${event} is ${typeof handler}. Type of 'handler' must be a function.`
      )
    }

    const selector = this.createTeamsConversationUpdateSelector(event)
    this.addRoute(selector, handler)
    return this
  }

  public messageEventUpdate (
    event: TeamsMessageEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    if (typeof handler !== 'function') {
      throw new Error(
              `MessageUpdate 'handler' for ${event} is ${typeof handler}. Type of 'handler' must be a function.`
      )
    }

    const selector = this.createMessageEventUpdateSelector(event)
    this.addRoute(selector, handler)
    return this
  }

  public messageReactions (
    event: MessageReactionEvents,
    handler: (context: TurnContext, state: TState) => Promise<void>
  ): this {
    const selector = this.createMessageReactionSelector(event)
    this.addRoute(selector, handler)
    return this
  }

  public fileConsentAccept (
    handler: (context: TurnContext, state: TState, fileConsentResponse: FileConsentCardResponse) => Promise<void>
  ): this {
    const selector = (context: TurnContext): Promise<boolean> => {
      const valueAction = parseValueAction(context.activity.value)
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
                context.activity.name === 'fileConsent/invoke' &&
                valueAction === 'accept'
      )
    }
    const handlerWrapper = async (context: TurnContext, state: TState) => {
      await handler(context, state, context.activity.value as FileConsentCardResponse)
      await context.sendActivity({
        type: ActivityTypes.InvokeResponse,
        value: { status: 200 }
      } as Activity)
    }
    this.addRoute(selector, handlerWrapper, true)
    return this
  }

  public fileConsentDecline (
    handler: (context: TurnContext, state: TState, fileConsentResponse: FileConsentCardResponse) => Promise<void>
  ): this {
    const selector = (context: TurnContext): Promise<boolean> => {
      const valueAction = parseValueAction(context.activity.value)
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
                context.activity.name === 'fileConsent/invoke' &&
                valueAction === 'decline'
      )
    }
    const handlerWrapper = async (context: TurnContext, state: TState) => {
      await handler(context, state, context.activity.value as FileConsentCardResponse)
      await context.sendActivity({
        type: ActivityTypes.InvokeResponse,
        value: { status: 200 }
      } as Activity)
    }
    this.addRoute(selector, handlerWrapper, true)
    return this
  }

  public handoff (handler: (context: TurnContext, state: TState, continuation: string) => Promise<void>): this {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke && context.activity.name === 'handoff/action'
      )
    }
    const handlerWrapper = async (context: TurnContext, state: TState) => {
      const valueContinuation = parseValueContinuation(context.activity.value)
      await handler(context, state, valueContinuation)
      await context.sendActivity({
        type: ActivityTypes.InvokeResponse,
        value: { status: 200 }
      } as Activity)
    }
    this.addRoute(selector, handlerWrapper, true)
    return this
  }

  public async getTeamChannels (
    context: TurnContext | ConversationReference | Activity
  ): Promise<ChannelInfo[]> {
    let teamsChannels: ChannelInfo[] = []

    const reference: ConversationReference = this.getConversationReference(context)

    if (reference.conversation?.conversationType === 'channel') {
      await this.continueConversationAsync(reference, async (ctx) => {
        const teamId =
                ctx.activity?.channelData?.team?.id ??
                (ctx.activity?.conversation?.name === undefined ? ctx.activity?.conversation?.id : undefined)
        if (teamId) {
          teamsChannels = await TeamsInfo.getTeamChannels(ctx, teamId)
        }
      })
    }

    return teamsChannels
  }

  public async getTeamDetails (
    context: TurnContext | ConversationReference | Activity
  ): Promise<TeamDetails | undefined> {
    let teamDetails: TeamDetails | undefined

    const reference: ConversationReference = this.getConversationReference(context)

    if (reference.conversation?.conversationType === 'channel') {
      await this.continueConversationAsync(reference, async (ctx) => {
        const teamId =
                ctx.activity?.channelData?.team?.id ??
                (ctx.activity?.conversation?.name === undefined ? ctx.activity?.conversation?.id : undefined)
        if (teamId) {
          teamDetails = await TeamsInfo.getTeamDetails(ctx, teamId)
        }
      })
    }

    return teamDetails
  }

  public async getPagedMembers (
    context: TurnContext | ConversationReference,
    pageSize?: number,
    continuationToken?: string
  ): Promise<TeamsPagedMembersResult> {
    let pagedMembers: TeamsPagedMembersResult = { members: [], continuationToken: '' }
    await this.continueConversationAsync(context, async (ctx) => {
      pagedMembers = await TeamsInfo.getPagedMembers(ctx, pageSize, continuationToken)
    })

    return pagedMembers
  }

  public teamsReadReceipt (
    handler: (context: TurnContext, state: TState, readReceiptInfo: ReadReceiptInfo) => Promise<void>
  ): this {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
                context.activity.channelId === 'msteams' &&
                context.activity.name === 'application/vnd.microsoft/readReceipt'
      )
    }

    const handlerWrapper = (context: TurnContext, state: TState): Promise<void> => {
      const readReceiptInfo = context.activity.value as ReadReceiptInfo
      return handler(context, state, readReceiptInfo)
    }

    this.addRoute(selector, handlerWrapper)

    return this
  }

  private createMessageEventUpdateSelector (event: TeamsMessageEvents): RouteSelector {
    switch (event) {
      case 'editMessage':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.MessageUpdate &&
                        context?.activity?.channelData?.eventType === event
          )
        }
      case 'softDeleteMessage':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.MessageDelete &&
                        context?.activity?.channelData?.eventType === event
          )
        }
      case 'undeleteMessage':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.MessageUpdate &&
                        context?.activity?.channelData?.eventType === event
          )
        }
      default:
        throw new Error(`Invalid TeamsMessageEvent type: ${event}`)
    }
  }

  private createMessageReactionSelector (event: MessageReactionEvents): RouteSelector {
    switch (event) {
      case 'reactionsAdded':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.MessageReaction &&
                        Array.isArray(context?.activity?.reactionsAdded) &&
                        context.activity.reactionsAdded.length > 0
          )
        }
      case 'reactionsRemoved':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.MessageReaction &&
                        Array.isArray(context?.activity?.reactionsRemoved) &&
                        context.activity.reactionsRemoved.length > 0
          )
        }
    }
  }

  private getConversationReference (
    context: TurnContext | Activity | ConversationReference
  ): ConversationReference {
    let reference: ConversationReference
    if (typeof (context as TurnContext).activity === 'object') {
      reference = (context as TurnContext).activity.getConversationReference()
    } else if (typeof (context as Activity).type === 'string') {
      reference = (context as Activity).getConversationReference()
    } else {
      reference = context as ConversationReference
    }
    return reference
  }

  private createTeamsConversationUpdateSelector (event: TeamsConversationUpdateEvents): RouteSelector {
    switch (event) {
      case 'channelCreated':
      case 'channelDeleted':
      case 'channelRenamed':
      case 'channelRestored':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        context?.activity?.channelData?.eventType === event &&
                        context?.activity?.channelData?.channel &&
                        context.activity.channelData?.team
          )
        }
      case 'membersAdded':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        Array.isArray(context?.activity?.membersAdded) &&
                        context.activity.membersAdded.length > 0
          )
        }
      case 'membersRemoved':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        Array.isArray(context?.activity?.membersRemoved) &&
                        context.activity.membersRemoved.length > 0
          )
        }
      case 'teamRenamed':
      case 'teamDeleted':
      case 'teamHardDeleted':
      case 'teamArchived':
      case 'teamUnarchived':
      case 'teamRestored':
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        context?.activity?.channelData?.eventType === event &&
                        context?.activity?.channelData?.team
          )
        }
      default:
        return (context: TurnContext) => {
          return Promise.resolve(
            context?.activity?.type === ActivityTypes.ConversationUpdate &&
                        context?.activity?.channelData?.eventType === event
          )
        }
    }
  }
}
