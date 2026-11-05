/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { StorageWriteOptions } from './storage'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'

/**
 * Computes an absolute expiration time for a storage write.
 *
 * @param options The write options containing an optional TTL in seconds.
 * @returns The expiration time in milliseconds since the Unix epoch, or `undefined` when no TTL is set.
 * @throws A `RangeError` when the TTL is not finite or is not greater than zero.
 */
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
