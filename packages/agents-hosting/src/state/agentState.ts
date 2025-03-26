/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage, StorageKeyFactory, StoreItem } from '../storage/storage'
import { TurnContext } from '../turnContext'
import { createHash } from 'node:crypto'
import { AgentStatePropertyAccessor } from './agentStatePropertyAccesor'
import { debug } from '../logger'

const logger = debug('agents:state')

export interface CachedAgentState {
  state: { [id: string]: any }
  hash: string
}

/**
 * Manages the state of an Agent.
 */
export class AgentState {
  private readonly stateKey = Symbol('state')

  /**
    * Creates a new instance of AgentState.
    * @param storage The storage provider.
    * @param storageKey The storage key factory.
    */
  constructor (protected storage: Storage, protected storageKey: StorageKeyFactory) { }

  /**
   * Creates a property accessor for the specified property.
   * @param name The name of the property.
   * @returns A property accessor for the specified property.
   */
  createProperty<T = any>(name: string): AgentStatePropertyAccessor<T> {
    const prop: AgentStatePropertyAccessor<T> = new AgentStatePropertyAccessor<T>(this, name)
    return prop
  }

  /**
   * Loads the state from storage.
   * @param context The turn context.
   * @param force Whether to force loading the state.
   * @returns A promise that resolves to the loaded state.
   */
  public async load (context: TurnContext, force = false): Promise<any> {
    const cached: CachedAgentState = context.turnState.get(this.stateKey)

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

  /**
   * Saves the state to storage.
   * @param context The turn context.
   * @param force Whether to force saving the state.
   * @returns A promise that resolves when the save operation is complete.
   */
  public async saveChanges (context: TurnContext, force = false): Promise<void> {
    let cached: CachedAgentState = context.turnState.get(this.stateKey)
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

  /**
   * Clears the state from the turn context.
   * @param context The turn context.
   * @returns A promise that resolves when the clear operation is complete.
   */
  public async clear (context: TurnContext): Promise<void> {
    const emptyObjectToForceSave = { state: {}, hash: '' }
    context.turnState.set(this.stateKey, emptyObjectToForceSave)
  }

  /**
   * Deletes the state from storage.
   * @param context The turn context.
   * @returns A promise that resolves when the delete operation is complete.
   */
  public async delete (context: TurnContext): Promise<void> {
    if (context.turnState.has(this.stateKey)) {
      context.turnState.delete(this.stateKey)
    }
    const key = await this.storageKey(context)
    logger.info(`Deleting storage with key ${key}`)
    await this.storage.delete([key])
  }

  /**
   * Gets the state from the turn context.
   * @param context The turn context.
   * @returns The state, or undefined if the state is not found.
   */
  public get (context: TurnContext): any | undefined {
    const cached: CachedAgentState = context.turnState.get(this.stateKey)

    return typeof cached === 'object' && typeof cached.state === 'object' ? cached.state : undefined
  }

  /**
   * Calculates the change hash for the specified item.
   * @param item The item to calculate the hash for.
   * @returns The calculated hash.
   */
  private readonly calculateChangeHash = (item: StoreItem): string => {
    const { eTag, ...rest } = item

    // TODO review circular json structure
    const result = JSON.stringify(rest)

    const hash = createHash('sha256', { encoding: 'utf-8' })
    const hashed = hash.update(result).digest('hex')

    return hashed
  }
}
