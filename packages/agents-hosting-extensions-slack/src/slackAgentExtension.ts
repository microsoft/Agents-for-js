// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, Channels, ExceptionHelper } from '@microsoft/agents-activity'
import {
  AgentApplication,
  AgentExtension,
  RouteHandler,
  RouteSelector,
  TurnContext,
  TurnState,
} from '@microsoft/agents-hosting'
import { Errors } from './errorHelper.js'
import { SlackApi, SlackApiKey } from './api/slackApi.js'
import { getSlackChannel, getSlackChannelData, getSlackThreadTs } from './api/slackChannelData.js'
import { SlackStream, type SlackStreamOptions } from './api/slackStream.js'

export class SlackAgentExtension<TState extends TurnState = TurnState> extends AgentExtension<TState> {
  private readonly _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    super(Channels.Slack)
    this._app = app

    app.onTurn('beforeTurn', async (context: TurnContext, _state: TState): Promise<boolean> => {
      if (context.activity.channelId === Channels.Slack) {
        const token = getSlackChannelData(context)?.ApiToken ?? process.env.SLACK_TOKEN
        if (token) {
          context.turnState.set(SlackApiKey, new SlackApi(token))
        }
      }
      return true
    })
  }

  onSlackEvent (eventType: string, handler: RouteHandler<TurnState>): this {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const envelope = getSlackChannelData(context)?.SlackMessage
      const type = envelope?.event?.type ?? envelope?.type
      return Promise.resolve(type === eventType)
    }
    this.addRoute(this._app, routeSel, handler)
    return this
  }

  onSlackMessage (handler: RouteHandler<TurnState>): this
  onSlackMessage (text: string, handler: RouteHandler<TurnState>): this
  onSlackMessage (regex: RegExp, handler: RouteHandler<TurnState>): this
  onSlackMessage (
    textOrRegexOrHandler: string | RegExp | RouteHandler<TurnState>,
    handler?: RouteHandler<TurnState>
  ): this {
    let routeSel: RouteSelector

    if (typeof textOrRegexOrHandler === 'function') {
      routeSel = (context: TurnContext) =>
        Promise.resolve(context.activity.type === ActivityTypes.Message)
      this.addRoute(this._app, routeSel, textOrRegexOrHandler)
    } else if (typeof textOrRegexOrHandler === 'string') {
      routeSel = (context: TurnContext) =>
        Promise.resolve(
          context.activity.type === ActivityTypes.Message &&
          context.activity.text === textOrRegexOrHandler
        )
      this.addRoute(this._app, routeSel, handler!)
    } else {
      routeSel = (context: TurnContext) =>
        Promise.resolve(
          context.activity.type === ActivityTypes.Message &&
          textOrRegexOrHandler.test(context.activity.text ?? '')
        )
      this.addRoute(this._app, routeSel, handler!)
    }

    return this
  }

  createStream (context: TurnContext, options?: SlackStreamOptions): SlackStream {
    const api = context.turnState.get(SlackApiKey) as SlackApi | undefined
    if (!api) {
      throw ExceptionHelper.generateException(Error, Errors.SlackApiTokenMissing)
    }
    const channelData = getSlackChannelData(context)!
    const channel = getSlackChannel(context)!
    const threadTs = getSlackThreadTs(context)!

    return new SlackStream(api, channel, threadTs, {
      recipientTeamId: channelData.SlackMessage!.event!.team!,
      recipientUserId: channelData.SlackMessage!.event!.user!,
      ...options
    })
  }
}
