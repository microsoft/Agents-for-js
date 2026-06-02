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

/**
 * Channel extension that adds Slack-specific routing and API access to an {@link AgentApplication}.
 *
 * @remarks
 * Register via `app.registerExtension(new SlackAgentExtension(app), ext => { ... })`.
 *
 * On each turn with `channelId === 'slack'`, a `beforeTurn` hook resolves the bot token from
 * `activity.channelData.ApiToken` (injected by Azure Bot Service) or the `SLACK_TOKEN` environment
 * variable, and stores a {@link SlackApi} client in `context.turnState` under {@link SlackApiKey}.
 *
 * @typeParam TState - The turn state type used by the application.
 */
export class SlackAgentExtension<TState extends TurnState = TurnState> extends AgentExtension<TState> {
  private readonly _app: AgentApplication<TState>

  /**
   * Creates a new SlackAgentExtension and registers the before-turn token injection hook.
   * @param {AgentApplication<TState>} app - The agent application to attach to.
   */
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

  /**
   * Registers a route that handles Slack events of a specific type (e.g. `'block_actions'`).
   * Matches on the `type` field of the Slack event envelope or its inner `event` object.
   * @param {string} eventType - The Slack event type to match.
   * @param {RouteHandler<TurnState>} handler - Handler to invoke when the event type matches.
   * @returns {this} The extension instance, for chaining.
   */
  onSlackEvent (eventType: string, handler: RouteHandler<TurnState>): this {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const envelope = getSlackChannelData(context)?.SlackMessage
      const type = envelope?.event?.type ?? envelope?.type
      return Promise.resolve(type === eventType)
    }
    this.addRoute(this._app, routeSel, handler)
    return this
  }

  /**
   * Registers a route that handles all incoming Slack message activities.
   * @param {RouteHandler<TurnState>} handler - Handler to invoke for every Slack message.
   * @returns {this} The extension instance, for chaining.
   */
  onSlackMessage (handler: RouteHandler<TurnState>): this
  /**
   * Registers a route that handles Slack message activities whose text equals `text`.
   * @param {string} text - Exact text to match against `activity.text`.
   * @param {RouteHandler<TurnState>} handler - Handler to invoke on match.
   * @returns {this} The extension instance, for chaining.
   */
  onSlackMessage (text: string, handler: RouteHandler<TurnState>): this
  /**
   * Registers a route that handles Slack message activities whose text matches `regex`.
   * @param {RegExp} regex - Regular expression to test against `activity.text`.
   * @param {RouteHandler<TurnState>} handler - Handler to invoke on match.
   * @returns {this} The extension instance, for chaining.
   */
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

  /**
   * Creates a {@link SlackStream} for sending an agentic streaming response.
   * Reads the channel and thread timestamp from the incoming activity's channel data.
   * @param {TurnContext} context - The current turn context.
   * @param {SlackStreamOptions} [options] - Optional recipient and display mode overrides.
   * @returns {SlackStream} A stream instance ready to call `start()`.
   * @throws When no Slack bot token was injected into the turn state (missing token).
   */
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
