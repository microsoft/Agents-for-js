/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'

/**
 * Represents an item to be stored in a storage provider.
 *
 * @remarks
 * Each item can contain arbitrary data along with an optional eTag for optimistic concurrency control.
 */
export interface StoreItem {
  /**
   * Optional eTag used for optimistic concurrency control.
   *
   * @remarks
   * When set to '*', it indicates that the write should proceed regardless of existing data.
   * When comparing eTags, exact string matching is used to determine if data has changed.
   *
   */
  eTag?: string;

  /**
   * Additional properties can be stored in the item.
   *
   * @remarks
   * Each storage provider may have specific requirements or limitations on property names and values.
   *
   */
  [key: string]: any;
}

/**
 * Represents a collection of store items indexed by key.
 *
 * @remarks
 * Used as the return type for storage read operations.
 *
 */
export interface StoreItems {
  /**
   * Keys are the storage item identifiers, and values are the stored items.
   *
   * @remarks
   * If a requested key is not found during a read operation, it will not appear in this collection.
   *
   */
  [key: string]: any;
}

/**
 * A factory function to generate storage keys based on the conversation context.
 *
 * @param context The TurnContext for the current turn of conversation
 * @returns A string key for storage that uniquely identifies where to store the data
 *
 * @remarks
 * Allows different storage strategies based on the conversation state.
 *
 */
export type StorageKeyFactory = (context: TurnContext) => string | Promise<string>

/**
 * Defines the version 1 interface for storage operations in the Agents platform.
 *
 * @remarks
 * Storage providers persist state data across conversation turns, enabling
 * agents to maintain context over time. Different implementations may store
 * data in memory, databases, blob storage, or other persistence mechanisms.
 *
 * The interface is designed to be simple with just three core operations:
 * read, write, and delete. All operations are asynchronous to support both
 * in-memory and remote storage providers. New implementations should use
 * {@link StorageV2}; this V1 interface remains supported by
 * {@link StorageProvider} through a compatibility adapter.
 */
export interface Storage {
  /**
   * Reads store items from storage.
   *
   * @param keys The keys of the items to read
   * @returns A promise that resolves to the store items. Items that don't exist in storage will not be included in the result.
   * @throws If the keys array is empty or undefined
   */
  read: (keys: string[]) => Promise<StoreItem>;

  /**
   * Writes store items to storage.
   *
   * @param changes The items to write to storage, indexed by key
   * @returns A promise that resolves when the write operation is complete
   * @throws If the changes object is empty or undefined, or if an eTag conflict occurs and optimistic concurrency is enabled
   */
  write: (changes: StoreItem) => Promise<void>;

  /**
   * Deletes store items from storage.
   *
   * @param keys The keys of the items to delete
   * @returns A promise that resolves when the delete operation is complete
   */
  delete: (keys: string[]) => Promise<void>;
}

/**
 * The result of a version 2 storage read operation.
 *
 * A result is returned for every requested key. `value` and `version` are
 * available when `status` is {@link StorageOperationStatus.Succeeded}.
 */
export interface StorageReadResult<T extends object = Record<string, unknown>> {
  key: string;
  status: StorageOperationStatus;
  value?: T;
  version?: string;
}

/**
 * The result of a version 2 storage write operation.
 */
export interface StorageWriteResult {
  key: string;
  status: StorageOperationStatus;
  version?: string;
}

/**
 * The result of a version 2 storage delete operation.
 */
export interface StorageDeleteResult {
  key: string;
  status: StorageOperationStatus;
  version?: string;
}

/** A keyed set of storage read results. */
export type StorageReadResults<T extends object = Record<string, unknown>> = Record<string, StorageReadResult<T>>

/** A keyed set of storage write results. */
export type StorageWriteResults = Record<string, StorageWriteResult>

/** A keyed set of storage delete results. */
export type StorageDeleteResults = Record<string, StorageDeleteResult>

/** The outcome of one version 2 storage operation. */
export enum StorageOperationStatus {
  Succeeded = 'succeeded',
  NotFound = 'notFound',
  Conflict = 'conflict',
  ConditionNotMet = 'conditionNotMet',
}

/** The write mode for a version 2 storage operation. */
export enum StorageWriteMode {
  Upsert = 'upsert',
  CreateOnly = 'createOnly',
  Replace = 'replace',
}

/** Options applied to every item in a version 2 write operation. */
export interface StorageWriteOptions {
  mode?: StorageWriteMode;
  expectedVersion?: string;
}

/** Options applied to every item in a version 2 delete operation. */
export interface StorageDeleteOptions {
  expectedVersion?: string;
}

/** Supported storage contract versions. */
export const StorageVersions = {
  V1: 1,
  V2: 2,
} as const

/** The storage contract selected when a built-in provider is created. */
export type StorageVersion = typeof StorageVersions[keyof typeof StorageVersions]

/**
 * Selects a storage contract when a built-in provider is created.
 *
 * @remarks
 * `storageVersion` is the runtime discriminator for {@link StorageProvider}; custom legacy
 * providers must not use the value `2` unless they implement {@link StorageV2}. Keep the version
 * as a numeric literal when options are stored in a variable. Use `as const`, `satisfies`, or an
 * explicit `StorageVersionOptions` type because a mutable object can widen `2` to `number` and
 * prevent version-specific return-type inference.
 */
export interface StorageVersionOptions<V extends StorageVersion> {
  storageVersion: V;
}

/** Read result selected by a built-in provider's storage version. */
export type StorageReadReturn<V extends StorageVersion, T extends object = Record<string, unknown>> =
  V extends typeof StorageVersions.V2 ? StorageReadResults<T> : StoreItem

/** Write values selected by a built-in provider's storage version. */
export type StorageWriteChanges<V extends StorageVersion, T extends object = Record<string, unknown>> =
  V extends typeof StorageVersions.V2 ? Record<string, T> : StoreItem

/** Additional write arguments selected by a built-in provider's storage version. */
export type StorageWriteArguments<V extends StorageVersion> =
  V extends typeof StorageVersions.V2 ? [options?: StorageWriteOptions] : []

/** Write result selected by a built-in provider's storage version. */
export type StorageWriteReturn<V extends StorageVersion> =
  V extends typeof StorageVersions.V2 ? StorageWriteResults : void

/** Additional delete arguments selected by a built-in provider's storage version. */
export type StorageDeleteArguments<V extends StorageVersion> =
  V extends typeof StorageVersions.V2 ? [options?: StorageDeleteOptions] : []

/** Delete result selected by a built-in provider's storage version. */
export type StorageDeleteReturn<V extends StorageVersion> =
  V extends typeof StorageVersions.V2 ? StorageDeleteResults : void

/**
 * The version-selected contract implemented by built-in storage providers.
 * The version literal selects the input and result types of every operation.
 */
export interface VersionedStorage<V extends StorageVersion> {
  readonly storageVersion: V;

  read<T extends object = Record<string, unknown>>(keys: string[]): Promise<StorageReadReturn<V, T>>;
  write<T extends object = Record<string, unknown>>(changes: StorageWriteChanges<V, T>, ...args: StorageWriteArguments<V>): Promise<StorageWriteReturn<V>>;
  delete(keys: string[], ...args: StorageDeleteArguments<V>): Promise<StorageDeleteReturn<V>>;
}

/**
 * The version 2 storage contract.
 *
 * This intentionally does not extend {@link Storage}: JavaScript cannot
 * overload methods by return type at runtime.
 */
export interface StorageV2 extends VersionedStorage<typeof StorageVersions.V2> {
  readonly storageVersion: typeof StorageVersions.V2;
}

/** A storage implementation supported by public hosting interfaces. */
export type StorageProvider = Storage | StorageV2
