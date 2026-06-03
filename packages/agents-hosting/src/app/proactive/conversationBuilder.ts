// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { ChannelAccount, ConversationAccount, ConversationReference } from '@microsoft/agents-activity'
import type { TurnContext } from '../../turnContext'
import { Conversation, type ConversationClaims } from './conversation'
import { ConversationReferenceBuilder } from './conversationReferenceBuilder'

/**
 * Fluent builder for the `Conversation` class.
 *
 * @example
 * ```typescript
 * // Build from scratch
 * const conv = ConversationBuilder
 *   .create('my-client-id', 'msteams')
 *   .withUser('user-aad-id')
 *   .withConversationId('19:channel@thread.skype')
 *   .build()
 *
 * // Build from a live TurnContext
 * const conv = ConversationBuilder.fromContext(turnContext).build()
 * ```
 */
export class ConversationBuilder {
  private readonly _agentClientId: string
  private readonly _channelId: string
  private readonly _serviceUrl: string
  private _claims: ConversationClaims
  private _reference: Partial<ConversationReference>

  private constructor (
    agentClientId: string,
    channelId: string,
    serviceUrl: string,
    claims: ConversationClaims,
    reference: Partial<ConversationReference>
  ) {
    this._agentClientId = agentClientId
    this._channelId = channelId
    this._serviceUrl = serviceUrl
    this._claims = claims
    this._reference = reference
  }

  /**
   * Creates a new builder for the given agent and channel.
   * @param requestorId Optional: the client ID of the app making the request.
   *   Becomes the `appid` claim, used in multi-tenant Azure Bot scenarios.
   */
  static create (
    agentClientId: string,
    channelId: string,
    serviceUrl?: string,
    requestorId?: string
  ): ConversationBuilder {
    const claims: ConversationClaims = { aud: agentClientId }
    if (requestorId) claims.appid = requestorId
    return new ConversationBuilder(agentClientId, channelId, serviceUrl ?? '', claims, ConversationReferenceBuilder.create(agentClientId, channelId, serviceUrl).build())
  }

  /**
   * Creates a builder pre-populated from a live `TurnContext`.
   * Captures both the conversation reference and the JWT identity claims.
   */
  static fromContext (context: TurnContext): ConversationBuilder {
    const ref = context.activity.getConversationReference()
    const id = context.identity
    const aud = Array.isArray(id?.aud) ? id.aud[0] : (id?.aud ?? '')
    const claims: ConversationClaims = {
      ...(id ?? {}),
      aud,
    } as ConversationClaims
    return new ConversationBuilder(
      aud,
      ref.channelId,
      ref.serviceUrl ?? '',
      claims,
      ref
    )
  }

  /** Sets `reference.user`. */
  withUser (userId: string, userName?: string): this {
    const user: ChannelAccount = { id: userId, name: userName }
    this._reference = { ...this._reference, user }
    return this
  }

  /** Sets `reference.conversation.id`. */
  withConversationId (id: string): this {
    const conversation: ConversationAccount = { ...(this._reference.conversation ?? { isGroup: false }), id }
    this._reference = { ...this._reference, conversation }
    return this
  }

  /** Sets `reference.conversation` from a full `ConversationAccount`. */
  withConversation (account: ConversationAccount): this {
    this._reference = { ...this._reference, conversation: account }
    return this
  }

  /** Sets `reference.activityId`. */
  withActivityId (activityId: string): this {
    this._reference = { ...this._reference, activityId }
    return this
  }

  /**
   * Merges a partial `ConversationReference` into the current one.
   * Useful for overlaying externally-provided reference data without losing
   * fields set by earlier builder calls.
   */
  withReference (ref: Partial<ConversationReference>): this {
    this._reference = { ...this._reference, ...ref }
    return this
  }

  /** Builds the `Conversation`, auto-filling `serviceUrl` from channel defaults if needed. */
  build (): Conversation {
    const serviceUrl =
      this._serviceUrl ||
      this._reference.serviceUrl ||
      ConversationReferenceBuilder.serviceUrlForChannel(this._channelId)

    const reference: ConversationReference = {
      conversation: this._reference.conversation ?? { id: '', isGroup: false },
      agent: this._reference.agent ?? { id: this._agentClientId },
      ...this._reference,
      // Ensure channelId and serviceUrl always use our resolved values
      channelId: this._channelId,
      serviceUrl,
    }

    const conv = new Conversation(this._claims, reference)
    conv.validate()
    return conv
  }
}
