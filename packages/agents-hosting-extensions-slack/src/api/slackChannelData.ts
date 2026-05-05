// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { TurnContext } from '@microsoft/agents-hosting'

/**
 * A single interactive action from a Slack Block Kit `block_actions` payload.
 */
export interface SlackAction {
  /** Identifier of the action that was triggered. */
  action_id: string
  /** Identifier of the block that contains the action. */
  block_id?: string
  /** Action element type (e.g. `'button'`). */
  type: string
  /** Value associated with the action element. */
  value?: string
  [key: string]: unknown
}

/**
 * The raw Slack event envelope provided by Azure Bot Service in `activity.channelData.SlackMessage`.
 */
export interface SlackEventEnvelope {
  /** Slack workspace ID. */
  team_id?: string
  /** Slack app ID. */
  api_app_id?: string
  /** The inner Slack event object. */
  event?: {
    /** Slack event type (e.g. `'message'`, `'app_mention'`). */
    type: string
    /** Channel ID where the event occurred. */
    channel: string
    /** Thread timestamp, present when the message is part of a thread. */
    thread_ts?: string
    /** User ID of the sender. */
    user: string
    /** Workspace ID. */
    team: string
    /** Message text. */
    text?: string
    /** Timestamp of the message. */
    ts: string
    [key: string]: unknown
  }
  /** Outer event type (e.g. `'event_callback'`, `'block_actions'`). */
  type?: string
  /** Unique event identifier. */
  event_id?: string
  /** Unix timestamp when the event was dispatched. */
  event_time?: number
  /** Interactive actions present for `block_actions` payloads. */
  actions?: SlackAction[]
}

/**
 * Typed shape of `activity.channelData` for Slack activities arriving via Azure Bot Service.
 */
export interface SlackChannelData {
  /** Raw Slack event envelope translated by ABS. */
  SlackMessage?: SlackEventEnvelope
  /** Bot token injected by ABS when configured in the Slack channel settings. */
  ApiToken?: string
}

/**
 * Returns the typed Slack channel data from the turn context's activity.
 * @param {TurnContext} context - The current turn context.
 * @returns {SlackChannelData | undefined} The channel data, or `undefined` if not present.
 */
export function getSlackChannelData (context: TurnContext): SlackChannelData | undefined {
  return context.activity.channelData as SlackChannelData | undefined
}

/**
 * Returns the Slack channel ID from the incoming event.
 * @param {TurnContext} context - The current turn context.
 * @returns {string | undefined} The channel ID, or `undefined` if not available.
 */
export function getSlackChannel (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.channel
}

/**
 * Returns the thread timestamp from the incoming event.
 * Falls back to the message's own `ts` when `thread_ts` is absent (e.g. first message in a DM thread).
 * @param {TurnContext} context - The current turn context.
 * @returns {string | undefined} The thread timestamp, or `undefined` if not available.
 */
export function getSlackThreadTs (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.thread_ts ?? getSlackChannelData(context)?.SlackMessage?.event?.ts
}

/**
 * Returns the Slack user ID of the message sender.
 * @param {TurnContext} context - The current turn context.
 * @returns {string | undefined} The user ID, or `undefined` if not available.
 */
export function getSlackUserId (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.user
}
