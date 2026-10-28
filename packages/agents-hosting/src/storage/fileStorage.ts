/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug, redactString, trace } from '@microsoft/agents-telemetry'
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

const logger = debug('agents:file-storage')

class FileStorageInternals {
  private readonly statePath: string
  private readonly versionsPath: string
  private readonly expirationsPath: string
  readonly state: Record<string, unknown>
  readonly versions: Record<string, string>
  readonly expirations: Record<string, number>

  constructor (folder: string) {
    fs.mkdirSync(folder, { recursive: true })
    this.statePath = path.join(folder, 'state.json')
    this.versionsPath = path.join(folder, 'state.versions.json')
    this.expirationsPath = path.join(folder, 'state.expirations.json')
    if (!fs.existsSync(this.statePath)) fs.writeFileSync(this.statePath, '{}')
    this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Record<string, unknown>
    this.versions = fs.existsSync(this.versionsPath)
      ? JSON.parse(fs.readFileSync(this.versionsPath, 'utf8')) as Record<string, string>
      : {}
    this.expirations = fs.existsSync(this.expirationsPath)
      ? JSON.parse(fs.readFileSync(this.expirationsPath, 'utf8')) as Record<string, number>
      : {}
  }

  flush (): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
    if (fs.existsSync(this.versionsPath) || Object.keys(this.versions).length > 0) {
      fs.writeFileSync(this.versionsPath, JSON.stringify(this.versions, null, 2))
    }
    if (fs.existsSync(this.expirationsPath) || Object.keys(this.expirations).length > 0) {
      fs.writeFileSync(this.expirationsPath, JSON.stringify(this.expirations, null, 2))
    }
  }

  getOrCreateVersion (key: string): string {
    const version = this.versions[key] ?? randomUUID()
    this.versions[key] = version
    return version
  }

  isExpired (key: string): boolean {
    const expiresAt = this.expirations[key]
    return expiresAt !== undefined && expiresAt <= Date.now()
  }

  remove (key: string): void {
    delete this.state[key]
    delete this.versions[key]
    delete this.expirations[key]
  }
}

/**
 * A file-based storage implementation that persists data to the local filesystem.
 *
 * @remarks
 * FileStorage stores all data in a single JSON file named `state.json` within a specified folder.
 * This implementation is suitable for development scenarios, local testing, and single-instance
 * deployments where shared state across multiple instances is not required.
 *
 * Values remain a key-value JSON object in `state.json`. V2 keeps generated storage versions in
 * `state.versions.json` so a value's own `eTag` property is not changed. All operations use
 * synchronous file I/O wrapped in Promise interfaces. Use {@link FileStorageV2} for the
 * structured StorageV2 contract.
 * V2 supports create-only, replace, and expected-version conditions.
 *
 * The inherited constructor creates the folder and `state.json` when needed, then loads values
 * and V2 version metadata into memory. It creates `state.versions.json` on the first V2 write.
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
 * const storageV2 = new FileStorageV2('./data-v2')
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
export class FileStorage extends FileStorageInternals implements Storage {
  /**
   * Reads legacy items from `state.json`.
   *
   * @param keys The keys to read; must not be empty.
   * @returns Existing items keyed by storage key. Missing keys are omitted.
   */
  async read (keys: string[]): Promise<StoreItem> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (!keys || keys.length === 0) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
      }
      const items = Object.fromEntries(keys
        .filter(key => Boolean(this.state[key]))
        .map(key => [key, this.state[key]])) as StoreItem
      return items
    })
  }

  /**
   * Writes legacy items to `state.json`.
   *
   * @param changes The items to write, keyed by storage key.
   * @throws If `changes` is invalid or the file cannot be written.
   */
  async write (changes: StoreItem): Promise<void> {
    return trace(StorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
      }
      Object.assign(this.state, changes)
      for (const key of Object.keys(changes)) {
        delete this.versions[key]
        delete this.expirations[key]
      }
      this.flush()
    })
  }

  /**
   * Deletes legacy items from `state.json`.
   *
   * @param keys The keys to delete; must not be empty. Missing keys are ignored.
   */
  async delete (keys: string[]): Promise<void> {
    return trace(StorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (!keys || keys.length === 0) {
        throw ExceptionHelper.generateException(ReferenceError, Errors.StorageDeleteKeysRequired)
      }
      for (const key of keys) {
        this.remove(key)
      }
      this.flush()
    })
  }
}

/**
 * A file-backed provider for the structured {@link StorageV2} contract.
 *
 * This is the V2 counterpart to {@link FileStorage}. Values are stored in `state.json`, while
 * generated storage versions are stored separately in `state.versions.json`; an `eTag` property
 * in an application value is therefore preserved. Reads and mutations return a result for every
 * requested key and support create-only, replace, and expected-version conditions.
 *
 * Like {@link FileStorage}, this provider is for development, local testing, and single-instance
 * deployments. It does not provide cross-process concurrency or multi-key atomicity.
 */
export class FileStorageV2 extends StorageV2 {
  private readonly internals: FileStorageInternals

  /**
   * Creates a V2 file storage provider.
   *
   * @param folder The absolute or relative folder where `state.json` is stored.
   * @throws May throw filesystem errors if the folder or state file cannot be created or read.
   */
  constructor (folder: string) {
    super()
    this.internals = new FileStorageInternals(folder)
  }

  /**
   * Reads items and their stored versions from the local state files.
   *
   * @param keys The keys to read. Empty batches are valid.
   * @returns A result for every key, with `notFound` for missing items. Returned values are cloned.
   */
  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    return trace(StorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      validateV2Keys(keys)
      let createdVersion = false
      const results = Object.fromEntries(keys.map(key => {
        if (!Object.prototype.hasOwnProperty.call(this.internals.state, key) || this.internals.isExpired(key)) {
          if (this.internals.isExpired(key)) {
            logger.info('Item expired, deleting from storage', { key: redactString(key, true) })
            this.internals.remove(key)
            createdVersion = true
          }
          return [key, { key, status: StorageOperationStatus.NotFound }]
        }
        const value = structuredClone(this.internals.state[key]) as T
        const version = this.internals.versions[key]
        createdVersion ||= version === undefined
        return [key, {
          key,
          status: StorageOperationStatus.Succeeded,
          value,
          version: version ?? this.internals.getOrCreateVersion(key),
        }]
      }))
      if (createdVersion) this.internals.flush()
      return results
    })
  }

  /**
   * Writes cloned items and generated versions to the local state files.
   *
   * @param changes The values to write, keyed by storage key.
   * @param options Create-only, replace, or expected-version conditions.
   * @returns A result for every supplied key, including concurrency-condition outcomes.
   */
  async write<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    return trace(StorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      validateExpectedVersion(options?.expectedVersion)
      validateV2Changes(changes)

      const results: StorageWriteResults = {}
      const expiresAt = getStorageWriteExpiry(options)
      const mode = options?.mode ?? StorageWriteMode.Upsert
      validateWriteMode(mode)
      let changed = false
      let createdVersion = false
      for (const [key, value] of Object.entries(changes)) {
        if (this.internals.isExpired(key)) {
          logger.info('Item expired, deleting from storage', { key: redactString(key, true) })
          this.internals.remove(key)
          changed = true
        }
        const current = this.internals.state[key]
        createdVersion ||= current !== undefined && this.internals.versions[key] === undefined
        const currentVersion = current === undefined
          ? undefined
          : this.internals.getOrCreateVersion(key)
        if (mode === StorageWriteMode.CreateOnly && current !== undefined) {
          results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
        } else if (mode === StorageWriteMode.Replace && current === undefined) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
        } else if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
        } else {
          const version = randomUUID()
          this.internals.state[key] = structuredClone(value)
          this.internals.versions[key] = version
          if (expiresAt === undefined) delete this.internals.expirations[key]
          else this.internals.expirations[key] = expiresAt
          results[key] = { key, status: StorageOperationStatus.Succeeded, version }
          changed = true
        }
      }
      if (changed || createdVersion) this.internals.flush()
      return results
    })
  }

  /**
   * Deletes items and their versions from the local state files.
   *
   * @param keys The keys to delete. Empty batches are valid.
   * @param options An optional expected storage version.
   * @returns A result for every supplied key.
   */
  async delete (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    return trace(StorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      validateExpectedVersion(options?.expectedVersion)
      validateV2Keys(keys)

      const results: StorageDeleteResults = {}
      let changed = false
      let createdVersion = false
      for (const key of keys) {
        if (this.internals.isExpired(key)) {
          logger.info('Item expired, deleting from storage', { key: redactString(key, true) })
          this.internals.remove(key)
          changed = true
        }
        const current = this.internals.state[key]
        createdVersion ||= current !== undefined && this.internals.versions[key] === undefined
        const currentVersion = current === undefined
          ? undefined
          : this.internals.getOrCreateVersion(key)
        if (current === undefined) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
        } else if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
        } else {
          this.internals.remove(key)
          results[key] = { key, status: StorageOperationStatus.Succeeded, version: currentVersion }
          changed = true
        }
      }
      if (changed || createdVersion) this.internals.flush()
      return results
    })
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
