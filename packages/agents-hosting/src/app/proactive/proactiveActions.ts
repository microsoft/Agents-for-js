/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-activity/logger'
import { JwtPayload } from 'jsonwebtoken'
import { AgentApplication } from '../agentApplication'
import { TurnContext } from '../../turnContext'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'
import { ProactiveOptions, ProactiveReferenceRecord, ProactiveSendResult } from './proactiveTypes'

const logger = debug('agents:app:proactive')

interface StoredReferenceMap {
  [key: string]: ProactiveReferenceRecord | undefined;
}

const DEFAULT_KEY_PREFIX = 'proactive'

type ActivityLike = Activity | Partial<Activity>

/**
 * Provides helper APIs for proactive communication scenarios.
 *
 * @typeParam TState - The turn state type used by the parent application.
 */
export class ProactiveActions<TState extends TurnState> {
  private readonly _app: AgentApplication<TState>
  private readonly _options: ProactiveOptions
  private readonly _storage?: Storage

  constructor (app: AgentApplication<TState>, options?: ProactiveOptions) {
    this._app = app
    this._options = options ?? {}
    this._storage = this._options.storage ?? app.options.storage

    if (this._options.autoPersistReferences) {
      if (!this._storage) {
        logger.warn('Proactive auto persistence requested but no storage was configured. Auto persistence disabled.')
      } else {
        this.registerAutoPersistence()
      }
    }
  }

  /**
   * Saves the conversation reference and identity for a conversation.
   *
   * @param conversationId - Conversation identifier.
   * @param channelId - Channel identifier.
   * @param identity - Identity associated with the conversation.
   * @param reference - Conversation reference to persist.
   * @param ttlOverrideSeconds - Optional TTL override in seconds.
   */
  public async saveReference (
    conversationId: string,
    channelId: string,
    identity: JwtPayload,
    reference: ConversationReference,
    ttlOverrideSeconds?: number
  ): Promise<void> {
    const storage = this.ensureStorage()
    const key = await this.getStorageKey(channelId, conversationId)
    const existing = await storage.read([key]) as StoredReferenceMap
    const now = new Date()

    const expiresUtc = this.computeExpiry(now, ttlOverrideSeconds ?? this._options.referenceTtlSeconds)

    const record: ProactiveReferenceRecord = {
      conversationId,
      channelId,
      identity,
      reference,
      updatedUtc: now.toISOString(),
      expiresUtc,
      eTag: existing?.[key]?.eTag
    }

    await storage.write({ [key]: { ...record, eTag: record.eTag ?? '*' } })
  }

  /**
   * Retrieves a stored conversation reference.
   *
   * @param conversationId - Conversation identifier.
   * @param channelId - Channel identifier.
   * @returns The stored record or undefined when not found/expired.
   */
  public async getReference (
    conversationId: string,
    channelId: string
  ): Promise<ProactiveReferenceRecord | undefined> {
    const storage = this.ensureStorage()
    const key = await this.getStorageKey(channelId, conversationId)
    const data = await storage.read([key]) as StoredReferenceMap
    const record = data[key]

    if (!record) {
      return undefined
    }

    if (this.isExpired(record)) {
      logger.debug(`Discarding expired proactive reference for ${channelId}:${conversationId}`)
      await storage.delete([key])
      return undefined
    }

    return record
  }

  /**
   * Deletes a stored conversation reference.
   *
   * @param conversationId - Conversation identifier.
   * @param channelId - Channel identifier.
   */
  public async deleteReference (
    conversationId: string,
    channelId: string
  ): Promise<void> {
    const storage = this.ensureStorage()
    const key = await this.getStorageKey(channelId, conversationId)
    await storage.delete([key])
  }

  /**
   * Sends activities to a previously stored conversation reference.
   *
   * @param conversationId - Conversation identifier used as storage key.
   * @param channelId - Channel identifier used as storage key.
   * @param activities - Activities to send.
   * @returns Activity IDs returned from the channel.
   */
  public async sendActivities (
    conversationId: string,
    channelId: string,
    activities: ActivityLike[]
  ): Promise<ProactiveSendResult> {
    if (activities.length === 0) {
      return { activityIds: [] }
    }

    const record = await this.getReference(conversationId, channelId)
    if (!record) {
      throw new Error(`No proactive reference found for conversation ${channelId}:${conversationId}`)
    }

    return await this.sendToReference(record.identity, record.reference, activities)
  }

  /**
   * Sends activities directly using the provided identity and conversation reference.
   *
   * @param identity - Claims identity to use.
   * @param reference - Conversation reference to continue.
   * @param activities - Activities to send.
   * @returns Activity IDs returned from the channel.
   */
  public async sendToReference (
    identity: JwtPayload,
    reference: ConversationReference,
    activities: ActivityLike[]
  ): Promise<ProactiveSendResult> {
    if (!identity) {
      throw new TypeError('identity is required to send proactive activities.')
    }

    if (!reference) {
      throw new TypeError('reference is required to send proactive activities.')
    }

    if (!this._app.adapter) {
      throw new Error('Cannot send proactive activities because no adapter was configured.')
    }

    const activityIds: string[] = []

    await this._app.adapter.continueConversation(identity, reference, async (turnContext: TurnContext) => {
      const toSend = activities.map((activity) => Activity.fromObject(activity))

      const responses = await turnContext.sendActivities(toSend)
      responses.forEach((response) => {
        if (response?.id) {
          activityIds.push(response.id)
        } else {
          activityIds.push('')
        }
      })
    })

    return { activityIds }
  }

  private registerAutoPersistence (): void {
    this._app.onTurn('afterTurn', async (context) => {
      try {
        if (!context.activity?.conversation?.id || !context.activity.channelId) {
          return true
        }

        const identity = context.identity
        if (!identity) {
          logger.debug('Unable to persist proactive reference because context identity is missing.')
          return true
        }

        if (context.activity.type === ActivityTypes.EndOfConversation) {
          await this.deleteReference(context.activity.conversation.id, context.activity.channelId)
          return true
        }

        const reference = context.activity.getConversationReference()
        await this.saveReference(context.activity.conversation.id, context.activity.channelId, identity, reference)
      } catch (err) {
        const message = err instanceof Error ? err.stack ?? err.message : String(err)
        logger.error(message)
      }

      return true
    })
  }

  private ensureStorage (): Storage {
    if (!this._storage) {
      throw new Error('Proactive messaging requires storage to be configured.')
    }
    return this._storage
  }

  private async getStorageKey (channelId: string, conversationId: string): Promise<string> {
    if (this._options.keyFactory) {
      return await this._options.keyFactory(channelId, conversationId)
    }
    return `${DEFAULT_KEY_PREFIX}:${channelId}:${conversationId}`
  }

  private computeExpiry (now: Date, ttlSeconds?: number): string | undefined {
    if (!ttlSeconds || ttlSeconds <= 0) {
      return undefined
    }

    return new Date(now.getTime() + ttlSeconds * 1000).toISOString()
  }

  private isExpired (record: ProactiveReferenceRecord): boolean {
    if (!record.expiresUtc) {
      return false
    }

    const expiry = new Date(record.expiresUtc).getTime()
    return !isNaN(expiry) && expiry <= Date.now()
  }
}
