/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function randomUUID (): string {
  return globalThis.crypto.randomUUID()
}
