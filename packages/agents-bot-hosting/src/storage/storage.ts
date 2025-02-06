/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'

export interface StoreItem {
  eTag?: string
  [key: string]: any
}

export interface StoreItems {
  [key: string]: any;
}

export type StorageKeyFactory = (context: TurnContext) => string

export interface Storage {
  read: (keys: string[]) => Promise<StoreItem>
  write: (changes: StoreItem) => Promise<void>
  delete: (keys: string[]) => Promise<void>
}
