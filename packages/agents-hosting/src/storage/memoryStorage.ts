/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug, trace } from '@microsoft/agents-telemetry'
import { Errors } from '../errorHelper'
import { StorageTraceDefinitions } from '../observability'
import { getStorageWriteExpiry } from './storageExpiry'
import {
  StorageDeleteOptions,
  StorageDeleteResults,
  StorageOperationStatus,
  StorageReadResults,
  StorageWriteMode,
  StorageWriteOptions,
  StorageWriteResults,
  Storage,
  StorageV2,
  StoreItem,
} from './storage'

const logger = debug('agents:memory-storage')

interface MemoryStorageState {
  memory: { [key: string]: string };
  versions: { [key: string]: string };
  expirations: { [key: string]: number };
  etag: number;
}

class MemoryStorageInternals {
  private static readonly states = new WeakMap<object, MemoryStorageState>()

  readonly state: MemoryStorageState

  /**
   * Creates an internal in-memory provider for the selected storage contract.
   */
  constructor (memory: { [key: string]: string } = {}) {
    let state = MemoryStorageInternals.states.get(memory)
    if (!state) {
      state = { memory, versions: {}, expirations: {}, etag: getNextETag(memory) }
      MemoryStorageInternals.states.set(memory, state)
    }
    this.state = state
  }

  save (key: string, item: unknown, expiresAt?: number): string {
    const version = (this.state.etag++).toString()
    this.state.memory[key] = JSON.stringify(item)
    this.state.versions[key] = version
    if (expiresAt === undefined) delete this.state.expirations[key]
    else this.state.expirations[key] = expiresAt
    return version
  }

  getVersion (key: string, value: StoreItem): string | undefined {
    return this.state.versions[key] ?? value.eTag as string | undefined
  }

  isExpired (key: string): boolean {
    const expiresAt = this.state.expirations[key]
    return expiresAt !== undefined && expiresAt <= Date.now()
  }

  remove (key: string): void {
    delete this.state.memory[key]
    delete this.state.versions[key]
    delete this.state.expirations[key]
  }
}

/**
 * A simple in-memory storage provider for development and testing.
 *
 * This class implements the legacy {@link Storage} contract. Use
 * {@link MemoryStorageV2} for the structured StorageV2 contract.
 */
export class MemoryStorage extends MemoryStorageInternals implements Storage {
  private static instance: MemoryStorage

  constructor (memory: { [key: string]: string } = {}) {
    super(memory)
  }

  /**
   * Reads legacy items from process-local memory.
   *
   * @param keys The keys to read; must not be empty.
   * @returns Existing items keyed by storage key. Missing keys are omitted and returned items
   * include their legacy `eTag`.
   */
  async read (keys: string[]): Promise<StoreItem> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (!keys || keys.length === 0) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
      }

      const data: StoreItem = {}
      for (const key of keys) {
        logger.debug(`Reading key: ${key}`)
        if (this.isExpired(key)) this.remove(key)
        const item = this.state.memory[key]
        if (item) {
          const value = JSON.parse(item)
          const version = this.getVersion(key, value)
          data[key] = version === undefined ? value : { ...value, eTag: version }
        }
      }
      return data
    })
  }

  /**
   * Writes legacy items to process-local memory.
   *
   * @param changes The items to write, keyed by storage key.
   * @throws If `changes` is invalid or an item supplies a stale legacy `eTag`.
   */
  async write (changes: StoreItem, options?: StorageWriteOptions): Promise<void> {
    return trace(StorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
      }

      const expiresAt = getStorageWriteExpiry(options)
      for (const [key, newItem] of Object.entries(changes)) {
        logger.debug(`Writing key: ${key}`)
        if (this.isExpired(key)) this.remove(key)
        const oldItemStr = this.state.memory[key]
        if (!oldItemStr || newItem.eTag === '*' || !newItem.eTag) {
          const { eTag: _eTag, ...value } = newItem
          this.save(key, { ...value, eTag: (this.state.etag).toString() }, expiresAt)
          continue
        }
        const oldItem = JSON.parse(oldItemStr)
        if (newItem.eTag === this.getVersion(key, oldItem)) {
          const { eTag: _eTag, ...value } = newItem
          this.save(key, { ...value, eTag: (this.state.etag).toString() }, expiresAt)
        } else {
          throw ExceptionHelper.generateException(Error, Errors.StorageETagConflict, undefined, { key })
        }
      }
    })
  }

  /**
   * Deletes legacy items from process-local memory.
   *
   * @param keys The keys to delete. Missing keys are ignored.
   */
  async delete (keys: string[]): Promise<void> {
    return trace(StorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      logger.debug(`Deleting keys: ${keys.join(', ')}`)
      for (const key of keys) {
        this.remove(key)
      }
    })
  }

  static getSingleInstance (): MemoryStorage {
    if (!MemoryStorage.instance) MemoryStorage.instance = new MemoryStorage()
    return MemoryStorage.instance
  }
}

/**
 * An in-memory provider for the structured {@link StorageV2} contract.
 *
 * Unlike {@link MemoryStorage}, every read returns an outcome for every requested key, and every
 * write and delete returns an outcome for every supplied key. Storage versions are returned
 * separately from application values, so an `eTag` property in a value is preserved. Use
 * {@link StorageWriteMode.CreateOnly}, {@link StorageWriteMode.Replace}, or `expectedVersion` to
 * guard concurrent writes.
 *
 * This provider is intended for development and testing only; state is process-local.
 */
export class MemoryStorageV2 extends StorageV2 {
  private static instance: MemoryStorageV2
  private readonly internals: MemoryStorageInternals

  /**
   * Creates a V2 in-memory storage provider.
   *
   * @param memory Optional backing store to share with another in-memory storage instance.
   */
  constructor (memory: { [key: string]: string } = {}) {
    super()
    this.internals = new MemoryStorageInternals(memory)
  }

  /**
   * Reads items from process-local memory.
   *
   * @param keys The keys to read. Empty batches are valid.
   * @returns A result for every key, with `notFound` for missing items and a separate storage
   * version for successful reads.
   */
  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (!Array.isArray(keys)) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
      }
      if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
      }

      const results: StorageReadResults<T> = {}
      for (const key of keys) {
        logger.debug(`Reading key: ${key}`)
        if (this.internals.isExpired(key)) this.internals.remove(key)
        const item = this.internals.state.memory[key]
        if (!item) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          continue
        }
        const value = JSON.parse(item) as T & StoreItem
        results[key] = { key, status: StorageOperationStatus.Succeeded, value, version: this.internals.getVersion(key, value) }
      }
      return results
    })
  }

  /**
   * Writes items to process-local memory with optional concurrency conditions.
   *
   * @param changes The values to write, keyed by storage key.
   * @param options Create-only, replace, or expected-version conditions.
   * @returns A result for every supplied key, including `conflict` or `conditionNotMet` when a
   * condition cannot be satisfied.
   */
  async write<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    return trace(StorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      if (options?.expectedVersion === '') {
        throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
      }
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
      }
      if (Object.values(changes).some(value => value === null || typeof value !== 'object' || Array.isArray(value))) {
        throw ExceptionHelper.generateException(TypeError, Errors.StorageV2ValueRequired)
      }
      if (Object.keys(changes).some(key => key.trim() === '')) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
      }

      const results: StorageWriteResults = {}
      const expiresAt = getStorageWriteExpiry(options)
      const mode = options?.mode ?? StorageWriteMode.Upsert
      if (!Object.values(StorageWriteMode).includes(mode)) {
        throw ExceptionHelper.generateException(RangeError, Errors.StorageV2WriteModeUnsupported, undefined, { mode: String(mode) })
      }
      for (const [key, newItem] of Object.entries(changes)) {
        if (this.internals.isExpired(key)) this.internals.remove(key)
        const oldItemStr = this.internals.state.memory[key]
        const oldItem = oldItemStr ? JSON.parse(oldItemStr) as StoreItem : undefined
        const currentVersion = oldItem ? this.internals.getVersion(key, oldItem) : undefined
        if (mode === StorageWriteMode.CreateOnly && oldItemStr) {
          results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
        } else if (mode === StorageWriteMode.Replace && !oldItemStr) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
        } else if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
        } else {
          results[key] = { key, status: StorageOperationStatus.Succeeded, version: this.internals.save(key, newItem, expiresAt) }
        }
      }
      return results
    })
  }

  /**
   * Deletes items from process-local memory with an optional version condition.
   *
   * @param keys The keys to delete. Empty batches are valid.
   * @param options An optional expected storage version.
   * @returns A result for every supplied key.
   */
  async delete (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    return trace(StorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (options?.expectedVersion === '') {
        throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
      }
      if (!Array.isArray(keys)) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
      }
      if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
      }

      const results: StorageDeleteResults = {}
      for (const key of keys) {
        if (this.internals.isExpired(key)) this.internals.remove(key)
        const item = this.internals.state.memory[key]
        if (!item) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          continue
        }
        const value = JSON.parse(item) as StoreItem
        const version = this.internals.getVersion(key, value)
        if (options?.expectedVersion !== undefined && options.expectedVersion !== version) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version }
          continue
        }
        this.internals.remove(key)
        results[key] = { key, status: StorageOperationStatus.Succeeded, version }
      }
      return results
    })
  }

  static getSingleInstance (): MemoryStorageV2 {
    if (!MemoryStorageV2.instance) MemoryStorageV2.instance = new MemoryStorageV2()
    return MemoryStorageV2.instance
  }
}

function getNextETag (memory: { [key: string]: string }): number {
  return Object.values(memory).reduce((next, item) => {
    try {
      const version = Number(JSON.parse(item)?.eTag)
      return Number.isSafeInteger(version) && version >= next ? version + 1 : next
    } catch {
      return next
    }
  }, 1)
}
