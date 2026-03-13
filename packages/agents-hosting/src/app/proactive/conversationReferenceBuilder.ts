// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { ConversationReference } from '@microsoft/agents-activity'

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

const CHANNEL_SERVICE_URLS: Record<string, string> = {
  msteams: TeamsServiceEndpoints.publicGlobal,
  webchat: 'https://webchat.botframework.com/',
  directline: 'https://directline.botframework.com/',
}

/**
 * Fluent builder for `ConversationReference`.
 */
export class ConversationReferenceBuilder {
  private readonly _agentClientId: string
  private readonly _channelId: string
  private readonly _serviceUrl: string
  private _userId?: string
  private _userName?: string
  private _conversationId?: string

  private constructor(agentClientId: string, channelId: string, serviceUrl?: string) {
    this._agentClientId = agentClientId
    this._channelId = channelId
    this._serviceUrl = serviceUrl ?? ''
  }

  /**
   * Creates a new builder.
   * @param agentClientId The agent's client (app) ID — set as `agent.id`.
   * @param channelId The target channel (e.g. `'msteams'`, `'webchat'`).
   * @param serviceUrl Optional override. If omitted, `build()` fills in the
   *   channel default via `serviceUrlForChannel()`.
   */
  static create(
    agentClientId: string,
    channelId: string,
    serviceUrl?: string
  ): ConversationReferenceBuilder {
    return new ConversationReferenceBuilder(agentClientId, channelId, serviceUrl)
  }

  /**
   * Returns the default service URL for a known channel, or empty string if unknown.
   */
  static serviceUrlForChannel(channelId: string): string {
    return CHANNEL_SERVICE_URLS[channelId] ?? ''
  }

  /** Sets `reference.user`. */
  withUser(userId: string, userName?: string): this {
    this._userId = userId
    this._userName = userName
    return this
  }

  /** Sets `reference.conversation.id`. */
  withConversationId(id: string): this {
    this._conversationId = id
    return this
  }

  /** Builds and returns the `ConversationReference`. */
  build(): ConversationReference {
    const serviceUrl =
      this._serviceUrl || ConversationReferenceBuilder.serviceUrlForChannel(this._channelId)

    const ref: ConversationReference = {
      channelId: this._channelId,
      serviceUrl,
      conversation: { id: this._conversationId ?? '', isGroup: false },
      agent: { id: this._agentClientId },
    }

    if (this._userId !== undefined) {
      ref.user = { id: this._userId, name: this._userName }
    }

    return ref
  }
}
