// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { AppBasedLinkQuery, MessagingExtensionAction, MessagingExtensionActionResponse, MessagingExtensionQuery, MessagingExtensionResponse } from '@microsoft/teams.api'
import { z } from 'zod'
import { messagingExtensionQueryZodSchema } from './messagingExtensionQuery'
import { TeamsTurnContext } from '../teamsTurnContext'

const appBasedLinkQuerySchema = z.object({
  url: z.string().optional(),
  state: z.string().optional()
}).passthrough()

function parseAppBasedLinkQuery (value: unknown): AppBasedLinkQuery | undefined {
  if (value == null) return undefined
  return appBasedLinkQuerySchema.parse(value) as AppBasedLinkQuery
}

function matchesCommandId (context: TurnContext, commandId: string | RegExp): boolean {
  const activityCommandId = (context.activity.value as any)?.commandId
  if (activityCommandId == null) return false
  return typeof commandId === 'string'
    ? activityCommandId === commandId
    : commandId.test(activityCommandId)
}

function matchesPreviewAction (context: TurnContext, previewAction: 'edit' | 'send'): boolean {
  const activityPreviewAction = (context.activity.value as any)?.botMessagePreviewAction
  return typeof activityPreviewAction !== 'string' ||
    activityPreviewAction.length === 0 ||
    activityPreviewAction.toLowerCase() === previewAction
}

function getActivityPreview (action: MessagingExtensionAction): Activity | undefined {
  const activityPreview = action.botActivityPreview?.[0]
  return activityPreview != null ? Activity.fromObject(activityPreview) : undefined
}

type RouteQueryHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, query: MessagingExtensionQuery) => Promise<MessagingExtensionResponse>
type SelectItemHandler<TState extends TurnState, TData = unknown> = (context: TeamsTurnContext, state: TState, item: TData) => Promise<MessagingExtensionResponse>
type QueryLinkHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, query: AppBasedLinkQuery | undefined) => Promise<MessagingExtensionResponse>
type FetchActionHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, action: MessagingExtensionAction) => Promise<MessagingExtensionActionResponse>
type SubmitActionHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, action: MessagingExtensionAction) => Promise<MessagingExtensionActionResponse>
type MessagePreviewEditHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, activity: Activity | undefined) => Promise<MessagingExtensionActionResponse>
type MessagePreviewSendHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, activity: Activity | undefined) => Promise<void>
type QuerySettingUrlHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState) => Promise<MessagingExtensionResponse>
type SettingHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, settings: MessagingExtensionQuery) => Promise<MessagingExtensionResponse>
type CardButtonClickedHandler<TState extends TurnState, TData = unknown> = (context: TeamsTurnContext, state: TState, cardData: TData) => Promise<void>

/**
 * Registers handlers for Microsoft Teams message extension invokes.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class MessageExtension<TState extends TurnState> {
  _app: AgentApplication<TState>

  /**
   * Creates a Teams message extension route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for compose extension query invokes.
   *
   * @param commandId - Command ID or regular expression used to match the query command.
   * @param handler - Handler invoked with the parsed messaging extension query.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
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
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state, messageExtensionQuery)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for compose extension select item invokes.
   *
   * @param handler - Handler invoked with the selected item payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onSelectItem<TData = unknown> (handler: SelectItemHandler<TState, TData>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/selectItem'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state, context.activity.value as TData)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for app-based link query invokes.
   *
   * @param handler - Handler invoked with the app-based link query payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
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
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state, query)
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for anonymous app-based link query invokes.
   *
   * @param handler - Handler invoked with the app-based link query payload, when present.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
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
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state, query)
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for compose extension fetch task invokes.
   *
   * @param commandId - Command ID or regular expression used to match the action command.
   * @param handler - Handler invoked with the messaging extension action payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
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
      const actionResponse: MessagingExtensionActionResponse = await handler(new TeamsTurnContext(context), state, context.activity.value as MessagingExtensionAction)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: actionResponse }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for compose extension submit action invokes.
   *
   * @param commandId - Command ID or regular expression used to match the action command.
   * @param handler - Handler invoked with the messaging extension action payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onSubmitAction (commandId: string | RegExp, handler: SubmitActionHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        matchesCommandId(context, commandId)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionActionResponse = await handler(new TeamsTurnContext(context), state, context.activity.value as MessagingExtensionAction)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for message preview edit submit action invokes.
   *
   * @param commandId - Command ID or regular expression used to match the action command.
   * @param handler - Handler invoked with the preview activity, when present.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onMessagePreviewEdit (commandId: string | RegExp, handler: MessagePreviewEditHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        matchesPreviewAction(context, 'edit') &&
        matchesCommandId(context, commandId)
      ))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const activity = getActivityPreview(context.activity.value as MessagingExtensionAction)
      const response: MessagingExtensionActionResponse = await handler(new TeamsTurnContext(context), state, activity)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for message preview send submit action invokes.
   *
   * @param commandId - Command ID or regular expression used to match the action command.
   * @param handler - Handler invoked with the preview activity, when present.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onMessagePreviewSend (commandId: string | RegExp, handler: MessagePreviewSendHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        matchesPreviewAction(context, 'send') &&
        matchesCommandId(context, commandId)
      ))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const msgExtensionAction = context.activity.value as MessagingExtensionAction
      const activityPreview = getActivityPreview(msgExtensionAction)
      await handler(new TeamsTurnContext(context), state, activityPreview)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: {} }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for compose extension query setting URL invokes.
   *
   * @param handler - Handler invoked when Teams requests a settings URL.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onQuerySettingUrl (handler: QuerySettingUrlHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/querySettingUrl'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for compose extension setting invokes.
   *
   * @param handler - Handler invoked with the messaging extension settings payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onSetting (handler: SettingHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/setting'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: MessagingExtensionResponse = await handler(new TeamsTurnContext(context), state, context.activity.value as MessagingExtensionQuery)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for card button clicked invokes from message extension cards.
   *
   * @param handler - Handler invoked with the card action payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message extension helper for chaining.
   */
  onCardButtonClicked<TData = unknown> (handler: CardButtonClickedHandler<TState, TData>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/onCardButtonClicked'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, context.activity.value as TData)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200 }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
