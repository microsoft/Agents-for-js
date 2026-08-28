/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { trace } from '@microsoft/agents-telemetry'
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

/**
 * A file-based storage implementation that persists data to the local filesystem.
 *
 * @remarks
 * FileStorage stores all data in a single JSON file named `state.json` within a specified folder.
 * This implementation is suitable for development scenarios, local testing, and single-instance
 * deployments where shared state across multiple instances is not required.
 *
 * The storage format is a key-value JSON object. All operations use synchronous file I/O wrapped
 * in Promise interfaces. Omit `storageVersion` to retain the legacy Storage contract. Set
 * `storageVersion: 2` in the second constructor argument to select StorageV2. V2 persists generated
 * versions and supports create-only, replace, and expected-version conditions.
 *
 * ### Warning
 * This implementation does not provide:
 * - Thread safety for concurrent access
 * - Atomic operations across multiple keys
 * - Scale for large datasets
 *
 * For production scenarios requiring these features, use a database-backed storage implementation.
 *
 * @example
 * ```typescript
 * const legacyStorage = new FileStorage('./data')
 * const storageV2 = new FileStorage('./data-v2', { storageVersion: 2 })
 *
 * await storageV2.write({
 *   user123: { name: 'John', lastSeen: new Date().toISOString() }
 * })
 *
 * const result = await storageV2.read(['user123'])
 * console.log(result.user123.value)
 *
 * await storageV2.delete(['user123'])
 * ```
 */
export class FileStorage<V extends StorageVersion = typeof StorageVersions.V1> implements VersionedStorage<V> {
  readonly storageVersion: V
  private readonly statePath: string
  private state: Record<string, unknown>

  /**
   * Creates a FileStorage instance that stores data in the specified folder.
   *
   * @param folder The absolute or relative folder where `state.json` is stored
   * @param options The storage contract version; omit it to use the legacy contract
   * @throws May throw filesystem errors if the folder or state file cannot be created or read
   *
   * @remarks
   * The constructor creates the folder and state file when needed, then loads the file into memory.
   */
  constructor (folder: string)
  constructor (folder: string, options: StorageVersionOptions<V>)
  constructor (folder: string, options?: StorageVersionOptions<V>) {
    const storageVersion = options?.storageVersion ?? StorageVersions.V1
    validateStorageVersion(storageVersion)
    this.storageVersion = storageVersion as V

    fs.mkdirSync(folder, { recursive: true })
    this.statePath = path.join(folder, 'state.json')
    if (!fs.existsSync(this.statePath)) fs.writeFileSync(this.statePath, '{}')
    this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Record<string, unknown>
  }

  /**
   * Reads store items from the filesystem storage.
   *
   * @param keys The keys to read
   * @returns Legacy items for V1, or one keyed operation result per requested key for V2
   * @throws ReferenceError when the key input is invalid
   *
   * @remarks
   * Reads use the in-memory state loaded during construction. External file changes are not observed.
   * V2 returns cloned values so caller mutations do not modify cached or persisted state.
   */
  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadReturn<V, T>> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (this.storageVersion === StorageVersions.V2) {
        return await this.readV2<T>(keys) as StorageReadReturn<V, T>
      }
      return await this.readV1(keys) as StorageReadReturn<V, T>
    })
  }

  /**
   * Writes store items to the filesystem storage.
   *
   * @param changes The key-value items to write
   * @param args V2 write options; unavailable for V1
   * @returns Nothing for V1, or one keyed operation result per change for V2
   *
   * @remarks
   * The method updates the in-memory state and rewrites the complete state file with two-space
   * indentation. V1 retains legacy unconditional-write behavior. V2 supports write modes and
   * expected-version conditions and generates a new version for each successful write.
   */
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

  /**
   * Deletes store items from the filesystem storage.
   *
   * @param keys The keys to delete
   * @param args V2 delete options; unavailable for V1
   * @returns Nothing for V1, or one keyed operation result per requested key for V2
   * @throws ReferenceError when the key input is invalid
   *
   * @remarks
   * Successful deletes update the in-memory state and rewrite the complete state file. V1 silently
   * ignores missing keys. V2 reports missing keys and expected-version failures in its results.
   */
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

    return Object.fromEntries(keys
      .filter(key => Boolean(this.state[key]))
      .map(key => [key, this.state[key]])) as StoreItem
  }

  private async readV2<T extends object> (keys: string[]): Promise<StorageReadResults<T>> {
    validateV2Keys(keys)
    return Object.fromEntries(keys.map(key => {
      if (!Object.prototype.hasOwnProperty.call(this.state, key)) {
        return [key, { key, status: StorageOperationStatus.NotFound }]
      }
      const value = structuredClone(this.state[key]) as T & { eTag?: string }
      return [key, {
        key,
        status: StorageOperationStatus.Succeeded,
        value,
        version: value.eTag,
      }]
    }))
  }

  private async writeV1 (changes: StoreItem): Promise<void> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
    }
    Object.assign(this.state, changes)
    this.flush()
  }

  private async writeV2<T extends object> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    validateExpectedVersion(options?.expectedVersion)
    validateV2Changes(changes)

    const results: StorageWriteResults = {}
    const mode = options?.mode ?? StorageWriteMode.Upsert
    validateWriteMode(mode)
    let changed = false
    for (const [key, value] of Object.entries(changes)) {
      const current = this.state[key] as { eTag?: string } | undefined
      const currentVersion = current?.eTag
      if (mode === StorageWriteMode.CreateOnly && current !== undefined) {
        results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
      } else if (mode === StorageWriteMode.Replace && current === undefined) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
      } else if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
        results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
      } else {
        const version = randomUUID()
        this.state[key] = structuredClone({ ...value, eTag: version })
        results[key] = { key, status: StorageOperationStatus.Succeeded, version }
        changed = true
      }
    }
    if (changed) this.flush()
    return results
  }

  private async deleteV1 (keys: string[]): Promise<void> {
    if (!keys || keys.length === 0) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.StorageDeleteKeysRequired)
    }
    for (const key of keys) delete this.state[key]
    this.flush()
  }

  private async deleteV2 (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    validateExpectedVersion(options?.expectedVersion)
    validateV2Keys(keys)

    const results: StorageDeleteResults = {}
    let changed = false
    for (const key of keys) {
      const current = this.state[key] as { eTag?: string } | undefined
      if (current === undefined) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
      } else if (options?.expectedVersion !== undefined && options.expectedVersion !== current.eTag) {
        results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: current.eTag }
      } else {
        delete this.state[key]
        results[key] = { key, status: StorageOperationStatus.Succeeded, version: current.eTag }
        changed = true
      }
    }
    if (changed) this.flush()
    return results
  }

  private flush (): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
  }
}

function validateStorageVersion (storageVersion: number): asserts storageVersion is StorageVersion {
  if (!Object.values(StorageVersions).some(version => version === storageVersion)) {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageVersionUnsupported, undefined, { storageVersion: String(storageVersion) })
  }
}

function validateV2Keys (keys: string[]): void {
  if (!Array.isArray(keys)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
  }
  if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function validateV2Changes (changes: Record<string, unknown>): void {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
  }
  if (Object.keys(changes).some(key => key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
  if (Object.values(changes).some(value => value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw ExceptionHelper.generateException(TypeError, Errors.StorageV2ValueRequired)
  }
}

function validateExpectedVersion (expectedVersion: string | undefined): void {
  if (expectedVersion === '') {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
  }
}

function validateWriteMode (mode: StorageWriteMode): void {
  if (!Object.values(StorageWriteMode).includes(mode)) {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageV2WriteModeUnsupported, undefined, { mode: String(mode) })
  }
}
