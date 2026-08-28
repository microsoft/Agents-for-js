/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import {
  Storage,
  StorageDeleteOptions,
  StorageDeleteResults,
  StorageOperationStatus,
  StorageProvider,
  StorageReadResults,
  StorageV2,
  StorageVersions,
  StorageWriteMode,
  StorageWriteOptions,
  StorageWriteResults,
  StoreItem,
} from './storage'

/** Returns true when a storage implementation declares the V2 contract. */
export function isStorageV2 (storage: StorageProvider): storage is StorageV2 {
  return (storage as Partial<StorageV2>).storageVersion === StorageVersions.V2
}

/** Converts a supported storage implementation to the V2 contract. */
export function asStorageV2 (storage: StorageProvider): StorageV2 {
  if (storage instanceof StorageV2ToStorageAdapter) return storage.source
  return isStorageV2(storage) ? storage : new StorageToStorageV2Adapter(storage)
}

/** Converts a supported storage implementation to the legacy contract. */
export function asStorage (storage: StorageProvider): Storage {
  return isStorageV2(storage) ? new StorageV2ToStorageAdapter(storage) : storage
}

/** Returns a successful V2 read value, maps not-found to undefined, and rejects invalid results. */
export function getStorageReadValue<T extends object> (results: StorageReadResults<T> | null | undefined, key: string): T | undefined {
  const result = results?.[key]
  if (result?.status === StorageOperationStatus.NotFound) return undefined
  if (result?.status === StorageOperationStatus.Succeeded) return result.value
  throwStorageResultError('read', key, result?.status)
}

/** Adapts V2 storage for legacy consumers that must retain the V1 interface. */
class StorageV2ToStorageAdapter implements Storage {
  constructor (private readonly storage: StorageV2) {}

  /** Returns the original V2 provider when an internal consumer needs the native contract. */
  get source (): StorageV2 {
    return this.storage
  }

  async read (keys: string[]): Promise<StoreItem> {
    const results = await this.storage.read(keys)
    return Object.fromEntries(keys.flatMap(key => {
      const value = getStorageReadValue(results, key)
      if (value === undefined) return []
      return [[key, { ...value, eTag: results?.[key]?.version }]]
    })) as StoreItem
  }

  async write (changes: StoreItem): Promise<void> {
    for (const [key, value] of Object.entries(changes)) {
      const eTag = value?.eTag
      const options = typeof eTag === 'string' && eTag !== '' && eTag !== '*'
        ? { expectedVersion: eTag }
        : undefined
      const results = await this.storage.write({ [key]: removeLegacyETag(value) }, options)
      if (results?.[key]?.status !== StorageOperationStatus.Succeeded) {
        throw ExceptionHelper.generateException(Error, Errors.StorageETagConflict, undefined, { key })
      }
    }
  }

  async delete (keys: string[]): Promise<void> {
    const results = await this.storage.delete(keys)
    assertStorageDeleteSucceeded(results, keys)
  }
}

/** Adapts the legacy storage contract to version 2 where its semantics allow it. */
class StorageToStorageV2Adapter implements StorageV2 {
  readonly storageVersion = StorageVersions.V2

  constructor (private readonly storage: Storage) {}

  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    validateKeys(keys)
    if (keys.length === 0) return {}

    const items = await this.storage.read(keys)
    return Object.fromEntries(keys.map(key => {
      const value = items[key]
      return [key, Object.prototype.hasOwnProperty.call(items, key)
        ? { key, status: StorageOperationStatus.Succeeded, value: value as T, version: value?.eTag as string | undefined }
        : { key, status: StorageOperationStatus.NotFound }]
    }))
  }

  async write<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    validateChanges(changes)
    if (options?.mode !== undefined && options.mode !== StorageWriteMode.Upsert) {
      throwUnsupportedOption('mode')
    }
    validateExpectedVersion(options?.expectedVersion)
    if (Object.keys(changes).length === 0) return {}
    const legacyChanges = Object.fromEntries(Object.entries(changes).map(([key, value]) => [
      key,
      options?.expectedVersion === undefined
        ? removeLegacyETag(value)
        : { ...removeLegacyETag(value), eTag: options.expectedVersion },
    ]))
    await this.storage.write(legacyChanges)
    return Object.fromEntries(Object.keys(changes).map(key => [key, { key, status: StorageOperationStatus.Succeeded }]))
  }

  async delete (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    validateKeys(keys)
    validateExpectedVersion(options?.expectedVersion)
    if (options?.expectedVersion !== undefined) {
      throwUnsupportedOption('expectedVersion')
    }
    if (keys.length === 0) return {}

    await this.storage.delete(keys)
    return Object.fromEntries(keys.map(key => [key, { key, status: StorageOperationStatus.Succeeded }]))
  }
}

function validateKeys (keys: string[]): void {
  if (!Array.isArray(keys)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageReadKeysRequired)
  }
  if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function validateChanges (changes: Record<string, unknown>): void {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageWriteChangesRequired)
  }
  if (Object.keys(changes).some(key => key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function removeLegacyETag<T> (value: T): T {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const { eTag: _eTag, ...withoutETag } = value as Record<string, unknown>
  return withoutETag as T
}

function validateExpectedVersion (expectedVersion: string | undefined): void {
  if (expectedVersion === '') {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2ExpectedVersionEmpty)
  }
}

function throwUnsupportedOption (option: string): never {
  throw ExceptionHelper.generateException(Error, Errors.StorageV2UnsupportedOption, undefined, { option })
}

/** Throws when a V2 write did not succeed for every requested key. */
export function assertStorageWriteSucceeded (results: StorageWriteResults | null | undefined, keys: string[]): void {
  assertStorageResults('write', results, keys, new Set([StorageOperationStatus.Succeeded]))
}

/** Throws when a V2 delete did not complete with idempotent V1 semantics. */
export function assertStorageDeleteSucceeded (results: StorageDeleteResults | null | undefined, keys: string[]): void {
  assertStorageResults(
    'delete',
    results,
    keys,
    new Set([StorageOperationStatus.Succeeded, StorageOperationStatus.NotFound])
  )
}

function assertStorageResults (
  operation: 'write' | 'delete',
  results: StorageWriteResults | StorageDeleteResults | null | undefined,
  keys: string[],
  acceptedStatuses: ReadonlySet<StorageOperationStatus>
): void {
  for (const key of keys) {
    const status = results?.[key]?.status
    if (status === undefined || !acceptedStatuses.has(status)) {
      throwStorageResultError(operation, key, status)
    }
  }
}

function throwStorageResultError (operation: 'read' | 'write' | 'delete', key: string, status?: StorageOperationStatus): never {
  throw ExceptionHelper.generateException(Error, Errors.StorageV2OperationFailed, undefined, {
    operation,
    key,
    status: status ?? 'missing',
  })
}
