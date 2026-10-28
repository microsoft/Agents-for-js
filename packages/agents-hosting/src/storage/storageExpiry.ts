/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { StorageWriteOptions } from './storage'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'

export function getStorageWriteExpiry (options?: StorageWriteOptions): number | undefined {
  const ttl = options?.ttl
  if (ttl === undefined) {
    return undefined
  }

  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw ExceptionHelper.generateException(RangeError, Errors.InvalidStorageTtl)
  }

  return Date.now() + ttl * 1000
}
