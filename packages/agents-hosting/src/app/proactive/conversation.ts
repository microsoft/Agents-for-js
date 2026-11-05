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
  /** Audience identifying the agent client. */
  aud: string
  /** Authorized-party client ID, when supplied by the token. */
  azp?: string
  /** Calling application ID, when supplied by the token. */
  appid?: string
  /** Microsoft Entra tenant ID, when supplied by the token. */
  tid?: string
  /** Additional string-valued identity claims. */
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
  /** Reference used to resume the conversation. */
  reference: ConversationReference
  /** Identity claims used to authenticate proactive operations. */
  claims: ConversationClaims

  /**
   * Creates a conversation from the current turn.
   *
   * @param context - Turn context from which to capture the reference and identity.
   */
  constructor (context: TurnContext)
  /**
   * Creates a conversation from explicit claims and a conversation reference.
   *
   * @param claims - Claims used to authenticate proactive operations.
   * @param reference - Reference used to resume the conversation.
   */
  constructor (claims: ConversationClaims, reference: ConversationReference)
  /**
   * Creates a conversation from a turn context or explicit claims and a reference.
   *
   * @param contextOrClaims - Turn context to capture, or authentication claims.
   * @param reference - Reference paired with explicit claims.
   */
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
