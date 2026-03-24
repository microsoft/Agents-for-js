// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { JwtPayload } from 'jsonwebtoken'
import type { ConversationReference } from '@microsoft/agents-activity'
import type { TurnContext } from '../../turnContext'

/**
 * JWT-like claims identifying the agent for proactive authentication.
 * `aud` (the agent's client ID) is required; all other fields are optional.
 */
export interface ConversationClaims {
  aud: string
  azp?: string
  appid?: string
  tid?: string
  [key: string]: string | undefined
}

/**
 * A serializable pair of a `ConversationReference` and the JWT claims needed
 * to authenticate proactive calls on behalf of this agent.
 *
 * Instances are stored in and retrieved from the proactive storage backend.
 * The `identity` getter produces the `JwtPayload` shape expected by
 * `adapter.continueConversation()`.
 */
export class Conversation {
  reference: ConversationReference
  claims: ConversationClaims

  constructor (context: TurnContext)
  constructor (reference: ConversationReference, claims: ConversationClaims)
  constructor (
    contextOrReference: TurnContext | ConversationReference,
    claims?: ConversationClaims
  ) {
    if ('activity' in contextOrReference) {
      // TurnContext overload
      const context = contextOrReference as TurnContext
      this.reference = context.activity.getConversationReference()
      const id = context.identity as JwtPayload | undefined
      this.claims = {
        aud: id?.aud ?? '',
        ...(id ?? {})
      } as ConversationClaims
    } else {
      // (reference, claims) overload
      this.reference = contextOrReference as ConversationReference
      this.claims = claims!
    }
  }

  /**
   * Returns a `JwtPayload`-compatible object for passing to
   * `adapter.continueConversation()` as `botAppIdOrIdentity`.
   */
  get identity (): JwtPayload {
    return this.claims as unknown as JwtPayload
  }

  /**
   * Returns a JSON string of `{ reference, claims }` — suitable for use in
   * HTTP request bodies when passing a conversation to another service.
   */
  toJson (): string {
    return JSON.stringify({ reference: this.reference, claims: this.claims })
  }

  /**
   * Throws if any required field is missing.
   * Called by `ConversationBuilder.build()` and `Proactive` methods before use.
   */
  validate (): void {
    if (!this.reference.conversation?.id) {
      throw new Error('Conversation is invalid: reference.conversation.id is required.')
    }
    if (!this.reference.serviceUrl) {
      throw new Error('Conversation is invalid: reference.serviceUrl is required.')
    }
    if (!this.claims.aud) {
      throw new Error('Conversation is invalid: claims.aud (agent client ID) is required.')
    }
  }
}
