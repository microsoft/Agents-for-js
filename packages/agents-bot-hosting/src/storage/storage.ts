/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'

/**
 * Represents an item to be stored.
 */
export interface StoreItem {
  eTag?: string
  [key: string]: any
}

/**
 * Represents a collection of store items.
 */
export interface StoreItems {
  [key: string]: any;
}

/**
 * A factory function to generate storage keys based on the context.
 * @param context The TurnContext for the current turn of conversation.
 * @returns A string key for storage.
 */
export type StorageKeyFactory = (context: TurnContext) => string

/**
 * Defines the interface for storage operations.
 */
export interface Storage {
  /**
   * Reads store items from storage.
   * @param keys The keys of the items to read.
   * @returns A promise that resolves to the store items.
   */
  read: (keys: string[]) => Promise<StoreItem>
  /**
   * Writes store items to storage.
   * @param changes The items to write to storage.
   * @returns A promise that resolves when the write operation is complete.
   */
  write: (changes: StoreItem) => Promise<void>
  /**
   * Deletes store items from storage.
   * @param keys The keys of the items to delete.
   * @returns A promise that resolves when the delete operation is complete.
   */
  delete: (keys: string[]) => Promise<void>
}
