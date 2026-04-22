// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { TurnContext } from '@microsoft/agents-hosting'

export interface SlackAction {
  action_id: string
  block_id?: string
  type: string
  value?: string
  [key: string]: unknown
}

export interface SlackEventEnvelope {
  team_id?: string
  api_app_id?: string
  event?: {
    type: string
    channel: string
    thread_ts?: string
    user: string
    team: string
    text?: string
    ts: string
    [key: string]: unknown
  }
  type?: string
  event_id?: string
  event_time?: number
  actions?: SlackAction[]
}

export interface SlackChannelData {
  SlackMessage?: SlackEventEnvelope
  ApiToken?: string
}

export function getSlackChannelData (context: TurnContext): SlackChannelData | undefined {
  return context.activity.channelData as SlackChannelData | undefined
}

export function getSlackChannel (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.channel
}

export function getSlackThreadTs (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.thread_ts ?? getSlackChannelData(context)?.SlackMessage?.event?.ts
}

export function getSlackUserId (context: TurnContext): string | undefined {
  return getSlackChannelData(context)?.SlackMessage?.event?.user
}
