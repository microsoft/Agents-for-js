/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug, trace } from '@microsoft/agents-telemetry'
import { Errors } from '../errorHelper'
import { StorageTraceDefinitions } from '../observability'
import {
  StorageDeleteArguments,
  StorageDeleteOptions,
  StorageDeleteResults,
  StorageDeleteReturn,
  StorageOperationStatus,
  StorageReadResults,
  StorageReadReturn,
  StorageVersion,
  StorageVersions,
  StorageVersionOptions,
  StorageWriteArguments,
  StorageWriteChanges,
  StorageWriteMode,
  StorageWriteOptions,
  StorageWriteResults,
  StorageWriteReturn,
  StoreItem,
  VersionedStorage,
} from './storage'

const logger = debug('agents:memory-storage')

interface MemoryStorageState {
  memory: { [key: string]: string };
  versions: { [key: string]: string };
  etag: number;
}

/**
 * A simple in-memory storage provider for development and testing.
 *
 * Omit `storageVersion` to retain the legacy Storage contract. Set
 * `storageVersion: 2` in the second constructor argument to select StorageV2.
 */
export class MemoryStorage<V extends StorageVersion = typeof StorageVersions.V1> implements VersionedStorage<V> {
  private static readonly singletonState: MemoryStorageState = { memory: {}, versions: {}, etag: 1 }
  private static readonly instances: Partial<Record<StorageVersion, MemoryStorage<any>>> = {}
  private static readonly states = new WeakMap<object, MemoryStorageState>()

  readonly storageVersion: V
  private state: MemoryStorageState

  /**
   * Creates an in-memory provider for the selected storage contract.
   *
   * @remarks
   * When options are stored in a variable, preserve `storageVersion` as a literal with `as const`,
   * `satisfies`, or an explicit {@link StorageVersionOptions} type so return types follow the version.
   */
  constructor (memory?: { [key: string]: string })
  constructor (memory: { [key: string]: string } | undefined, options: StorageVersionOptions<V>)
  constructor (
    memory: { [key: string]: string } = {},
    options?: StorageVersionOptions<V>
  ) {
    const storageVersion = options?.storageVersion ?? StorageVersions.V1
    validateStorageVersion(storageVersion)
    this.storageVersion = storageVersion as V
    let state = MemoryStorage.states.get(memory)
    if (!state) {
      state = { memory, versions: {}, etag: getNextETag(memory) }
      MemoryStorage.states.set(memory, state)
    }
    this.state = state
  }

  /**
   * Gets the shared in-memory provider for the selected contract.
   *
   * @remarks Preserve a variable option's version literal to keep version-specific return types.
   */
  static getSingleInstance (): MemoryStorage<typeof StorageVersions.V1>
  static getSingleInstance<V extends StorageVersion>(options: StorageVersionOptions<V>): MemoryStorage<V>
  static getSingleInstance<V extends StorageVersion>(options?: StorageVersionOptions<V>): MemoryStorage<V | 1> {
    const storageVersion = options?.storageVersion ?? StorageVersions.V1
    validateStorageVersion(storageVersion)
    let instance = MemoryStorage.instances[storageVersion]
    if (!instance) {
      instance = storageVersion === StorageVersions.V2
        ? new MemoryStorage<typeof StorageVersions.V2>(undefined, { storageVersion: StorageVersions.V2 })
        : new MemoryStorage<typeof StorageVersions.V1>()
      instance.state = MemoryStorage.singletonState
      MemoryStorage.instances[storageVersion] = instance
    }
    return instance as MemoryStorage<V | 1>
  }

  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadReturn<V, T>> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (this.storageVersion === StorageVersions.V2) {
        return await this.readV2<T>(keys) as StorageReadReturn<V, T>
      }
      return await this.readV1(keys) as StorageReadReturn<V, T>
    })
  }

  async write<T extends object = Record<string, unknown>> (
    changes: StorageWriteChanges<V, T>,
    ...args: StorageWriteArguments<V>
  ): Promise<StorageWriteReturn<V>> {
    return trace(StorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageWriteOptions?]
        return await this.writeV2(changes as Record<string, T>, options) as StorageWriteReturn<V>
      }
      await this.writeV1(changes as StoreItem)
      return undefined as StorageWriteReturn<V>
    })
  }

  async delete (keys: string[], ...args: StorageDeleteArguments<V>): Promise<StorageDeleteReturn<V>> {
    return trace(StorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageDeleteOptions?]
        return await this.deleteV2(keys, options) as StorageDeleteReturn<V>
      }
      await this.deleteV1(keys)
      return undefined as StorageDeleteReturn<V>
    })
  }

  private async readV1 (keys: string[]): Promise<StoreItem> {
    if (!keys || keys.length === 0) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
    }

    const data: StoreItem = {}
    for (const key of keys) {
      logger.debug(`Reading key: ${key}`)
      const item = this.state.memory[key]
      if (item) {
        const value = JSON.parse(item)
        const version = this.getVersion(key, value)
        data[key] = version === undefined ? value : { ...value, eTag: version }
      }
    }
    return data
  }

  private async readV2<T extends object> (keys: string[]): Promise<StorageReadResults<T>> {
    this.validateV2Keys(keys)

    const results: StorageReadResults<T> = {}
    for (const key of keys) {
      logger.debug(`Reading key: ${key}`)
      const item = this.state.memory[key]
      if (!item) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
        continue
      }
      const value = JSON.parse(item) as T & StoreItem
      results[key] = {
        key,
        status: StorageOperationStatus.Succeeded,
        value,
        version: this.getVersion(key, value),
      }
    }
    return results
  }

  private async writeV1 (changes: StoreItem): Promise<void> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
    }

    for (const [key, newItem] of Object.entries(changes)) {
      logger.debug(`Writing key: ${key}`)
      const oldItemStr = this.state.memory[key]
      if (!oldItemStr || newItem.eTag === '*' || !newItem.eTag) {
        this.saveV1Item(key, newItem)
        continue
      }
      const oldItem = JSON.parse(oldItemStr)
      if (newItem.eTag === this.getVersion(key, oldItem)) {
        this.saveV1Item(key, newItem)
      } else {
        throw ExceptionHelper.generateException(Error, Errors.StorageETagConflict, undefined, { key })
      }
    }
  }

  private async writeV2<T extends object> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    this.validateExpectedVersion(options?.expectedVersion)
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
    }
    if (Object.values(changes).some(value => value === null || typeof value !== 'object' || Array.isArray(value))) {
      throw ExceptionHelper.generateException(TypeError, Errors.StorageV2ValueRequired)
    }
    this.validateV2ChangeKeys(changes)

    const results: StorageWriteResults = {}
    const mode = options?.mode ?? StorageWriteMode.Upsert
    this.validateWriteMode(mode)
    for (const [key, newItem] of Object.entries(changes)) {
      const oldItemStr = this.state.memory[key]
      const oldItem = oldItemStr ? JSON.parse(oldItemStr) as StoreItem : undefined
      const currentVersion = oldItem ? this.getVersion(key, oldItem) : undefined

      if (mode === StorageWriteMode.CreateOnly && oldItemStr) {
        results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
      } else if (mode === StorageWriteMode.Replace && !oldItemStr) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
      } else if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
        results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
      } else {
        results[key] = { key, status: StorageOperationStatus.Succeeded, version: this.saveV2Item(key, newItem) }
      }
    }
    return results
  }

  private async deleteV1 (keys: string[]): Promise<void> {
    logger.debug(`Deleting keys: ${keys.join(', ')}`)
    for (const key of keys) {
      delete this.state.memory[key]
      delete this.state.versions[key]
    }
  }

  private async deleteV2 (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    this.validateExpectedVersion(options?.expectedVersion)
    this.validateV2Keys(keys)

    const results: StorageDeleteResults = {}
    for (const key of keys) {
      const item = this.state.memory[key]
      if (!item) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
        continue
      }
      const value = JSON.parse(item) as StoreItem
      const version = this.getVersion(key, value)
      if (options?.expectedVersion !== undefined && options.expectedVersion !== version) {
        results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version }
        continue
      }
      delete this.state.memory[key]
      delete this.state.versions[key]
      results[key] = { key, status: StorageOperationStatus.Succeeded, version }
    }
    return results
  }

  private validateV2Keys (keys: string[]): void {
    if (!Array.isArray(keys)) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
    }
    if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
    }
  }

  private validateV2ChangeKeys (changes: Record<string, unknown>): void {
    if (Object.keys(changes).some(key => key.trim() === '')) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
    }
  }

  private validateExpectedVersion (expectedVersion: string | undefined): void {
    if (expectedVersion === '') {
      throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
    }
  }

  private validateWriteMode (mode: StorageWriteMode): void {
    if (!Object.values(StorageWriteMode).includes(mode)) {
      throw ExceptionHelper.generateException(RangeError, Errors.StorageV2WriteModeUnsupported, undefined, { mode: String(mode) })
    }
  }

  private saveV1Item (key: string, item: StoreItem): string {
    const { eTag: _eTag, ...value } = item
    const version = (this.state.etag++).toString()
    this.state.memory[key] = JSON.stringify({ ...value, eTag: version })
    this.state.versions[key] = version
    return version
  }

  private saveV2Item (key: string, item: unknown): string {
    return this.saveItem(key, item)
  }

  private saveItem (key: string, item: unknown): string {
    const version = (this.state.etag++).toString()
    this.state.memory[key] = JSON.stringify(item)
    this.state.versions[key] = version
    return version
  }

  private getVersion (key: string, value: StoreItem): string | undefined {
    return this.state.versions[key] ?? value.eTag as string | undefined
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

function validateStorageVersion (storageVersion: number): asserts storageVersion is StorageVersion {
  if (!Object.values(StorageVersions).some(version => version === storageVersion)) {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageVersionUnsupported, undefined, { storageVersion: String(storageVersion) })
  }
}
