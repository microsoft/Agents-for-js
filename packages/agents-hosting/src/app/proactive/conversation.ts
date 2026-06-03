// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { JwtPayload } from 'jsonwebtoken'
import type { ConversationReference } from '@microsoft/agents-activity'
import { ExceptionHelper } from '@microsoft/agents-activity'
import type { TurnContext } from '../../turnContext'
import { Errors } from '../../errorHelper'

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
  constructor (claims: ConversationClaims, reference: ConversationReference)
  constructor (
    contextOrClaims: TurnContext | ConversationClaims,
    reference?: ConversationReference
  ) {
    if ('activity' in contextOrClaims) {
      // TurnContext overload
      const context = contextOrClaims as TurnContext
      this.reference = context.activity.getConversationReference()
      const id = context.identity as JwtPayload | undefined
      this.claims = {
        ...(id ?? {}),
        aud: Array.isArray(id?.aud) ? (id.aud as string[])[0] : (id?.aud ?? '')
      } as ConversationClaims
    } else {
      // (claims, reference) overload — matches C# parameter order
      this.claims = contextOrClaims as ConversationClaims
      this.reference = reference!
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
   * Called by `Proactive.storeConversation()` before writing to storage.
   */
  validate (): void {
    if (!this.reference.conversation?.id) {
      throw ExceptionHelper.generateException(Error, Errors.ConversationInvalidId)
    }
    if (!this.reference.serviceUrl) {
      throw ExceptionHelper.generateException(Error, Errors.ConversationInvalidServiceUrl)
    }
    if (!this.claims.aud) {
      throw ExceptionHelper.generateException(Error, Errors.ConversationInvalidAud)
    }
  }
}
