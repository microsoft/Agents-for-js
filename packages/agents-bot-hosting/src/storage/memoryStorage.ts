/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Storage, StoreItem } from './storage'
import { debug } from '../logger'

const logger = debug('agents:memory-storage')

/**
 * A simple in-memory storage provider.
 */
export class MemoryStorage implements Storage {
  private etag: number = 1

  /**
   * Creates a new instance of the MemoryStorage class.
   * @param memory An optional initial memory store.
   */
  constructor (private memory: { [k: string]: string } = {}) { }

  /**
   * Reads storage items from memory.
   * @param keys The keys of the items to read.
   * @returns A promise that resolves to the read items.
   * @throws Will throw an error if keys are not provided.
   */
  async read (keys: string[]): Promise<StoreItem> {
    if (!keys || keys.length === 0) {
      throw new ReferenceError('Keys are required when reading.')
    }

    const data: StoreItem = {}
    for (const key of keys) {
      logger.info(`Reading key: ${key}`)
      const item = this.memory[key]
      if (item) {
        data[key] = JSON.parse(item)
      }
    }

    return data
  }

  /**
   * Writes storage items to memory.
   * @param changes The items to write.
   * @returns A promise that resolves when the write operation is complete.
   * @throws Will throw an error if changes are not provided.
   */
  async write (changes: StoreItem): Promise<void> {
    if (!changes || changes.length === 0) {
      throw new ReferenceError('Changes are required when writing.')
    }

    for (const [key, newItem] of Object.entries(changes)) {
      logger.info(`Writing key: ${key}`)
      const oldItemStr = this.memory[key]
      if (!oldItemStr || newItem.eTag === '*' || !newItem.eTag) {
        this.saveItem(key, newItem)
      } else {
        const oldItem = JSON.parse(oldItemStr)
        if (newItem.eTag === oldItem.eTag) {
          this.saveItem(key, newItem)
        } else {
          throw new Error(`Storage: error writing "${key}" due to eTag conflict.`)
        }
      }
    }
  }

  /**
   * Deletes storage items from memory.
   * @param keys The keys of the items to delete.
   * @returns A promise that resolves when the delete operation is complete.
   */
  async delete (keys: string[]): Promise<void> {
    logger.info(`Deleting keys: ${keys.join(', ')}`)
    for (const key of keys) {
      delete this.memory[key]
    }
  }

  /**
   * Saves an item to memory.
   * @param key The key of the item to save.
   * @param item The item to save.
   */
  private saveItem (key: string, item: unknown): void {
    const clone = Object.assign({}, item, { eTag: (this.etag++).toString() })
    this.memory[key] = JSON.stringify(clone)
  }
}
