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
 * Options for storage write operations.
 */
export interface StorageWriteOptions {
  /**
   * If true, the write operation will only succeed if the item does not already exist in storage.
   *
   * @remarks
   * This is useful for scenarios where you want to ensure that you are creating a new item
   * and do not want to overwrite any existing data. If the item already exists, the write
   * operation will fail with an error.
   *
   * The default value is false, meaning that the write operation will overwrite existing items.
   */
  ifNotExists?: boolean;
}

/**
 * Defines the interface for storage operations in the Agents platform.
 *
 * @remarks
 * Storage providers persist state data across conversation turns, enabling
 * agents to maintain context over time. Different implementations may store
 * data in memory, databases, blob storage, or other persistence mechanisms.
 *
 * The interface is designed to be simple with just three core operations:
 * read, write, and delete. All operations are asynchronous to support both
 * in-memory and remote storage providers.
 */
export interface Storage {
  /**
   * Reads store items from storage.
   *
   * @param keys The keys of the items to read
   * @returns A promise that resolves to the store items. Items that don't exist in storage will not be included in the result.
   * @throws If the keys array is empty or undefined
   */
  read: (keys: string[]) => Promise<StoreItems>;

  /**
   * Writes store items to storage.
   *
   * @param changes The items to write to storage, indexed by key
   * @param options Optional settings for the write operation
   * @returns A promise that resolves to the written store items
   * @throws If the changes object is empty or undefined, or if an eTag conflict occurs and optimistic concurrency is enabled
   */
  write: (changes: StoreItems, options?: StorageWriteOptions) => Promise<StoreItems>;

  /**
   * Deletes store items from storage.
   *
   * @param keys The keys of the items to delete
   * @returns A promise that resolves when the delete operation is complete
   */
  delete: (keys: string[]) => Promise<void>;
}
