// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Activity, ChannelAccount, ConversationParameters } from '@microsoft/agents-activity'
import { Channels, ExceptionHelper, RoleTypes } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'
import { AzureBotScope, type CreateConversationOptions } from './createConversationOptions'
import type { ConversationClaims } from './conversation'
import { ConversationReferenceBuilder } from './conversationReferenceBuilder'

/**
 * Fluent builder for `CreateConversationOptions`.
 *
 * @example
 * ```typescript
 * const opts = CreateConversationOptionsBuilder
 *   .create('my-client-id', 'msteams')
 *   .withUser('user-aad-id')
 *   .withTenantId('tenant-id')
 *   .build()
 * ```
 */
export class CreateConversationOptionsBuilder {
  private readonly _claims: ConversationClaims
  private readonly _channelId: string
  private readonly _serviceUrl: string
  private _scope: string = AzureBotScope
  private _storeConversation: boolean = false
  private _parameters: Partial<ConversationParameters> = {
    channelData: {},
  }

  private _activity: Partial<Activity> | undefined

  private constructor (claims: ConversationClaims, channelId: string, serviceUrl?: string) {
    this._claims = claims
    this._channelId = channelId
    this._serviceUrl =
      serviceUrl ?? ConversationReferenceBuilder.serviceUrlForChannel(channelId)
  }

  /**
   * Creates a new builder from an agent client ID string.
   * @param agentClientId The agent's client (app) ID.
   * @param channelId The target channel (e.g. `'msteams'`).
   * @param serviceUrl Optional service URL override.
   */
  static create (agentClientId: string, channelId: string, serviceUrl?: string, parameters?: Partial<ConversationParameters>): CreateConversationOptionsBuilder
  /**
   * Creates a new builder from an existing claims object (e.g. from a stored `Conversation`).
   * @param claims JWT claims — `aud` must be the agent's client ID.
   * @param channelId The target channel (e.g. `'msteams'`).
   * @param serviceUrl Optional service URL override.
   */
  static create (claims: ConversationClaims, channelId: string, serviceUrl?: string, parameters?: Partial<ConversationParameters>): CreateConversationOptionsBuilder
  static create (
    agentClientIdOrClaims: string | ConversationClaims,
    channelId: string,
    serviceUrl?: string,
    parameters?: Partial<ConversationParameters>
  ): CreateConversationOptionsBuilder {
    const claims: ConversationClaims = typeof agentClientIdOrClaims === 'string'
      ? { aud: agentClientIdOrClaims }
      : agentClientIdOrClaims

    const builder = new CreateConversationOptionsBuilder(claims, channelId, serviceUrl)
    if (parameters) {
      builder._parameters = { ...builder._parameters, ...parameters }
    }

    // Set parameters.agent if not already provided — matches C# behavior
    if (!builder._parameters.agent) {
      builder._parameters.agent = { id: claims.aud, role: RoleTypes.Agent }
    }

    return builder
  }

  /** Adds a member (the target user) to `parameters.members`. */
  withUser (userId: string, userName?: string): this
  withUser (account: ChannelAccount): this
  withUser (userIdOrAccount: string | ChannelAccount, userName?: string): this {
    const account: ChannelAccount =
      typeof userIdOrAccount === 'string'
        ? { id: userIdOrAccount, name: userName }
        : userIdOrAccount
    const members = this._parameters.members ?? []
    members.push(account)
    this._parameters = { ...this._parameters, members }
    return this
  }

  /** Sets `parameters.activity`. Defaults `activity.type` to `'message'` if not provided. */
  withActivity (activity: Partial<Activity>): this {
    this._activity = activity
    return this
  }

  /** Merges additional channel-specific data into `parameters.channelData`. */
  withChannelData (data: object): this {
    this._parameters = {
      ...this._parameters,
      channelData: { ...(this._parameters.channelData as object ?? {}), ...data },
    }
    return this
  }

  /**
   * Sets `parameters.tenantId`.
   * On `msteams` channels, also sets `channelData.tenant.id`.
   */
  withTenantId (tenantId: string): this {
    this._parameters = { ...this._parameters, tenantId }
    if (this._channelId === Channels.Msteams) {
      this.withChannelData({ tenant: { id: tenantId } })
    }
    return this
  }

  /**
   * Sets `parameters.isGroup = true` and `channelData.channel.id`.
   * Only has effect on `msteams` channels.
   */
  withTeamsChannelId (teamsChannelId: string): this {
    if (this._channelId !== Channels.Msteams) return this
    this._parameters = { ...this._parameters, isGroup: true }
    this.withChannelData({ channel: { id: teamsChannelId } })
    return this
  }

  /** Sets `parameters.topicName`. */
  withTopicName (name: string): this {
    this._parameters = { ...this._parameters, topicName: name }
    return this
  }

  /** Sets `parameters.isGroup`. */
  isGroup (value: boolean): this {
    this._parameters = { ...this._parameters, isGroup: value }
    return this
  }

  /** Overrides the default `AzureBotScope` OAuth scope. */
  withScope (scope: string): this {
    this._scope = scope
    return this
  }

  /** Controls whether the resulting conversation is stored after creation. */
  storeConversation (value: boolean): this {
    this._storeConversation = value
    return this
  }

  /**
   * Builds and returns `CreateConversationOptions`.
   * @throws if no members were added via `withUser()`.
   */
  build (): CreateConversationOptions {
    if (!this._parameters.members?.length) {
      throw ExceptionHelper.generateException(Error, Errors.CreateConversationBuilderMembersRequired)
    }

    const activity: Partial<Activity> = {
      type: 'message',
      ...this._activity,
    }

    return {
      identity: this._claims,
      channelId: this._channelId,
      serviceUrl: this._serviceUrl,
      scope: this._scope,
      storeConversation: this._storeConversation,
      parameters: {
        ...this._parameters,
        activity: activity as Activity,
      },
    }
  }
}
