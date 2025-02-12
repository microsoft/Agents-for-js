/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage, StorageKeyFactory, StoreItem } from '../storage/storage'
import { TurnContext } from '../turnContext'
import { createHash } from 'node:crypto'
import { BotStatePropertyAccessor } from './botStatePropertyAccesor'
import { debug } from '../logger'

const logger = debug('agents:bot-state')

export interface CachedBotState {
  state: { [id: string]: any }
  hash: string
}

/**
 * Manages the state of a bot.
 */
export class BotState {
  private readonly stateKey = Symbol('state')

  /**
    * Creates a new instance of BotState.
    * @param storage The storage provider.
    * @param storageKey The storage key factory.
    */
  constructor (protected storage: Storage, protected storageKey: StorageKeyFactory) { }

  createProperty<T = any>(name: string): BotStatePropertyAccessor<T> {
    const prop: BotStatePropertyAccessor<T> = new BotStatePropertyAccessor<T>(this, name)
    return prop
  }

  public async load (context: TurnContext, force = false): Promise<any> {
    const cached: CachedBotState = context.turnState.get(this.stateKey)

    if (force || !cached || !cached.state) {
      const key = await this.storageKey(context)
      logger.info(`Reading storage with key ${key}`)
      const storedItem = await this.storage.read([key])

      const state: any = storedItem[key] || {}
      const hash: string = this.calculateChangeHash(state)
      context.turnState.set(this.stateKey, { state, hash })

      return state
    }

    return cached.state
  }

  public async saveChanges (context: TurnContext, force = false): Promise<void> {
    let cached: CachedBotState = context.turnState.get(this.stateKey)
    if (force || (cached && cached.hash !== this.calculateChangeHash(cached?.state))) {
      if (!cached) {
        cached = { state: {}, hash: '' }
      }
      cached.state.eTag = '*'
      const changes: StoreItem = {} as StoreItem

      const key = await this.storageKey(context)
      changes[key] = cached.state

      logger.info(`Writing storage with key ${key}`)
      await this.storage.write(changes)
      cached.hash = this.calculateChangeHash(cached.state)
      context.turnState.set(this.stateKey, cached)
    }
  }

  public async clear (context: TurnContext): Promise<void> {
    const emptyObjectToForceSave = { state: {}, hash: '' }
    context.turnState.set(this.stateKey, emptyObjectToForceSave)
  }

  public async delete (context: TurnContext): Promise<void> {
    if (context.turnState.has(this.stateKey)) {
      context.turnState.delete(this.stateKey)
    }
    const key = await this.storageKey(context)
    logger.info(`Deleting storage with key ${key}`)
    await this.storage.delete([key])
  }

  public get (context: TurnContext): any | undefined {
    const cached: CachedBotState = context.turnState.get(this.stateKey)

    return typeof cached === 'object' && typeof cached.state === 'object' ? cached.state : undefined
  }

  private readonly calculateChangeHash = (item: StoreItem): string => {
    const { eTag, ...rest } = item

    // TODO review circular json structure
    const result = JSON.stringify(rest)

    const hash = createHash('sha256', { encoding: 'utf-8' })
    const hashed = hash.update(result).digest('hex')

    return hashed
  }
}
