// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { MessagingExtensionAction, MessagingExtensionActionResponse, MessagingExtensionQuery, MessagingExtensionResponse } from '@microsoft/teams.api'
import { z } from 'zod'
import { messagingExtensionQueryZodSchema } from './messagingExtensionQuery'

const appBasedLinkQuerySchema = z.object({
  url: z.string().url()
})

function parseAppBasedLinkQuery (value: unknown): { url: string } {
  return appBasedLinkQuerySchema.parse(value)
}

function matchesCommandId (context: TurnContext, commandId: string | RegExp): boolean {
  const activityCommandId = (context.activity.value as any)?.commandId
  if (activityCommandId == null) return false
  return typeof commandId === 'string'
    ? activityCommandId === commandId
    : commandId.test(activityCommandId)
}

type RouteQueryHandler<TState extends TurnState> = (context: TurnContext, state: TState, query: MessagingExtensionQuery) => Promise<MessagingExtensionResponse>
type SelectItemHandler<TState extends TurnState, TData = unknown> = (context: TurnContext, state: TState, item: TData) => Promise<MessagingExtensionResponse>
type QueryLinkHandler<TState extends TurnState> = (context: TurnContext, state: TState, url: string) => Promise<MessagingExtensionResponse>
type FetchActionHandler<TState extends TurnState> = (context: TurnContext, state: TState, action: MessagingExtensionAction) => Promise<MessagingExtensionActionResponse>
type SubmitActionHandler<TState extends TurnState> = (context: TurnContext, state: TState, action: MessagingExtensionAction) => Promise<MessagingExtensionActionResponse>
type MessagePreviewEditHandler<TState extends TurnState> = (context: TurnContext, state: TState, activity: Activity) => Promise<MessagingExtensionActionResponse>
type MessagePreviewSendHandler<TState extends TurnState> = (context: TurnContext, state: TState, activity: Activity) => Promise<void>
type QueryUrlSettingHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<MessagingExtensionResponse>
type ConfigureSettingsHandler<TState extends TurnState> = (context: TurnContext, state: TState, settings: MessagingExtensionQuery) => Promise<MessagingExtensionResponse>
type CardButtonClickedHandler<TState extends TurnState, TData = unknown> = (context: TurnContext, state: TState, cardData: TData) => Promise<void>

export class MessageExtension<TState extends TurnState> {
  _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  onQuery (commandId: string | RegExp, handler: RouteQueryHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/query' &&
        matchesCommandId(context, commandId)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const messageExtensionQuery: MessagingExtensionQuery = messagingExtensionQueryZodSchema.parse(context.activity.value)
      const response: MessagingExtensionResponse = await handler(context, state, messageExtensionQuery)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onSelectItem<TData = unknown> (handler: SelectItemHandler<TState, TData>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/selectItem'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(context, state, context.activity.value as TData)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onQueryLink (handler: QueryLinkHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/queryLink'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const query = parseAppBasedLinkQuery(context.activity.value)
      const response: MessagingExtensionResponse = await handler(context, state, query.url)
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onAnonymousQueryLink (handler: QueryLinkHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/anonymousQueryLink'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const query = parseAppBasedLinkQuery(context.activity.value)
      const response: MessagingExtensionResponse = await handler(context, state, query.url)
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onFetchAction (commandId: string | RegExp, handler: FetchActionHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/fetchTask' &&
        matchesCommandId(context, commandId)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const actionResponse: MessagingExtensionActionResponse = await handler(context, state, context.activity.value as MessagingExtensionAction)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: actionResponse }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onSubmitAction (commandId: string | RegExp, handler: SubmitActionHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        !(context.activity.value as any)?.botMessagePreviewAction &&
        matchesCommandId(context, commandId)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionActionResponse = await handler(context, state, context.activity.value as MessagingExtensionAction)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onMessagePreviewEdit (commandId: string | RegExp, handler: MessagePreviewEditHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        (context.activity.value as any)?.botMessagePreviewAction === 'edit' &&
        matchesCommandId(context, commandId)
      ))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const activity = context.activity.value as Activity
      const response: MessagingExtensionActionResponse = await handler(context, state, activity)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onMessagePreviewSend (commandId: string | RegExp, handler: MessagePreviewSendHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        (context.activity.value as any)?.botMessagePreviewAction === 'send' &&
        matchesCommandId(context, commandId)
      ))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const msgExtensionAction = context.activity.value as MessagingExtensionAction
      const activityPreview: Activity = msgExtensionAction.botActivityPreview?.length! > 0
        ? Activity.fromObject(msgExtensionAction.botActivityPreview![0])
        : new Activity(ActivityTypes.Message)
      await handler(context, state, activityPreview)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onQueryUrlSetting (handler: QueryUrlSettingHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/querySettingUrl'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(context, state)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onConfigureSettings (handler: ConfigureSettingsHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/setting'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(context, state, context.activity.value as MessagingExtensionQuery)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onCardButtonClicked<TData = unknown> (handler: CardButtonClickedHandler<TState, TData>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/onCardButtonClicked'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(context, state, context.activity.value as TData)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200 }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
