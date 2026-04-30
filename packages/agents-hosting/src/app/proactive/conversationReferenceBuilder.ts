// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { ChannelAccount, ConversationReference } from '@microsoft/agents-activity'
import { Channels, RoleTypes } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:conversation-reference-builder')

/** Set of all channel IDs defined in the Channels enum, used for validation. */
const knownChannelIds = new Set(Object.values(Channels) as string[])

/**
 * Well-known Teams service URLs for proactive messaging.
 *
 * Use only when the incoming `serviceUrl` from a real conversation is unavailable.
 * Once you have received a `serviceUrl` from a real turn, cache and prefer that value.
 */
export const TeamsServiceEndpoints = {
  /** Standard public cloud Teams endpoint. */
  publicGlobal: 'https://smba.trafficmanager.net/teams/',
  /** US Government Community Cloud (GCC). */
  gcc: 'https://smba.infra.gcc.teams.microsoft.com/teams',
  /** US Government Community Cloud High (GCC-High). */
  gccHigh: 'https://smba.infra.gov.teams.microsoft.us/teams',
  /** US Department of Defense (DoD). */
  dod: 'https://smba.infra.dod.teams.microsoft.us/teams',
} as const

/**
 * Fluent builder for `ConversationReference`.
 */
export class ConversationReferenceBuilder {
  private readonly _channelId: string
  private _serviceUrl: string
  private _agent: ChannelAccount
  private _user?: ChannelAccount
  private _conversationId?: string
  private _activityId?: string
  private _locale?: string

  private constructor (channelId: string, serviceUrl: string, agent: ChannelAccount) {
    this._channelId = channelId
    this._serviceUrl = serviceUrl
    this._agent = agent
  }

  /**
   * Creates a new builder seeded with the agent identity and channel.
   * On Teams, the agent id is prefixed with `28:` automatically.
   * @param agentClientId The agent's client (app) ID.
   * @param channelId The target channel (e.g. `'msteams'`, `'webchat'`).
   * @param serviceUrl Optional override. If omitted, `build()` fills in the
   *   channel default via `serviceUrlForChannel()`.
   */
  static create (
    agentClientId: string,
    channelId: string,
    serviceUrl?: string
  ): ConversationReferenceBuilder {
    return new ConversationReferenceBuilder(
      channelId,
      serviceUrl ?? '',
      ConversationReferenceBuilder.agentForChannel(channelId, agentClientId)
    )
  }

  /**
   * Returns the default service URL for a channel.
   * Teams returns the public global endpoint; all other channels use the
   * `https://{channelId}.botframework.com/` pattern (matching C# behavior).
   */
  static serviceUrlForChannel (channelId: string): string {
    if (!channelId) return ''
    if (channelId === Channels.Msteams) return TeamsServiceEndpoints.publicGlobal
    if (!knownChannelIds.has(channelId)) {
      logger.warn(
        `serviceUrlForChannel: unrecognized channelId '${channelId}' — constructing fallback URL ` +
        'https://<channelId>.botframework.com/. Provide an explicit serviceUrl to suppress this warning.'
      )
    }
    return `https://${channelId}.botframework.com/`
  }

  /** Sets `reference.user` from an id + optional name. Role defaults to `RoleTypes.User`. */
  withUser (userId: string, userName?: string): this
  /** Sets `reference.user` from a full `ChannelAccount`. */
  withUser (account: ChannelAccount): this
  withUser (userIdOrAccount: string | ChannelAccount, userName?: string): this {
    this._user = typeof userIdOrAccount === 'string'
      ? { id: userIdOrAccount, name: userName, role: RoleTypes.User }
      : userIdOrAccount
    return this
  }

  /** Sets `reference.agent` from an id + optional name. Role defaults to `RoleTypes.Agent`. On Teams, id is prefixed with `28:`. */
  withAgent (agentClientId: string, agentName?: string): this
  /** Sets `reference.agent` from a full `ChannelAccount`. */
  withAgent (account: ChannelAccount): this
  withAgent (agentIdOrAccount: string | ChannelAccount, agentName?: string): this {
    this._agent = typeof agentIdOrAccount === 'string'
      ? ConversationReferenceBuilder.agentForChannel(this._channelId, agentIdOrAccount, agentName)
      : agentIdOrAccount
    return this
  }

  /** Sets `reference.serviceUrl`. */
  withServiceUrl (serviceUrl: string): this {
    this._serviceUrl = serviceUrl
    return this
  }

  /** Sets `reference.conversation.id`. */
  withConversationId (id: string): this {
    this._conversationId = id
    return this
  }

  /** Sets `reference.activityId`. */
  withActivityId (activityId: string): this {
    this._activityId = activityId
    return this
  }

  /** Sets `reference.locale`. */
  withLocale (locale: string): this {
    this._locale = locale
    return this
  }

  /** Builds and returns the `ConversationReference`. */
  build (): ConversationReference {
    const serviceUrl =
      this._serviceUrl || ConversationReferenceBuilder.serviceUrlForChannel(this._channelId)

    const ref: ConversationReference = {
      channelId: this._channelId,
      serviceUrl,
      conversation: { id: this._conversationId ?? '', isGroup: false },
      agent: this._agent,
      user: this._user ?? { role: RoleTypes.User },
    }

    if (this._activityId !== undefined) ref.activityId = this._activityId
    if (this._locale !== undefined) ref.locale = this._locale

    return ref
  }

  /**
   * Builds a `ChannelAccount` for the agent, applying the Teams `28:` id prefix
   * when the channel is `msteams`.
   */
  private static agentForChannel (channelId: string, agentClientId: string, agentName?: string): ChannelAccount {
    return {
      id: channelId === Channels.Msteams ? `28:${agentClientId}` : agentClientId,
      name: agentName,
      role: RoleTypes.Agent,
    }
  }
}
