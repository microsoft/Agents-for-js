// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { createHash } from 'crypto'

/**
 * Provides methods for escaping keys for Cosmos DB.
 */
export namespace CosmosDbKeyEscape {
  const maxKeyLength: number = 255
  const illegalKeys: readonly string[] = ['\\', '?', '/', '#', '\t', '\n', '\r', '*']
  const illegalKeyCharacterReplacementMap: Map<string, string> = illegalKeys.reduce<Map<string, string>>(
    (map: Map<string, string>, c: string) => {
      map.set(c, `*${c.charCodeAt(0).toString(16)}`)
      return map
    },
    new Map()
  )

  /**
   * Escapes a key for use in Cosmos DB.
   * @param key The key to escape.
   * @param keySuffix The suffix to append to the key.
   * @param compatibilityMode Indicates whether compatibility mode is enabled.
   * @returns The escaped key.
   */
  export function escapeKey (key: string, keySuffix?: string, compatibilityMode?: boolean): string {
    if (!key) {
      throw new Error("The 'key' parameter is required.")
    }

    const keySplitted: string[] = key.split('')
    const firstIllegalCharIndex: number = keySplitted.findIndex((c: string): boolean =>
      illegalKeys.some((i: string) => i === c)
    )

    if (firstIllegalCharIndex === -1) {
      return truncateKey(`${key}${keySuffix || ''}`, compatibilityMode)
    }

    const sanitizedKey = keySplitted.reduce(
      (result: string, c: string) =>
        result + (illegalKeyCharacterReplacementMap.has(c) ? illegalKeyCharacterReplacementMap.get(c)! : c),
      ''
    )

    return truncateKey(`${sanitizedKey}${keySuffix || ''}`, compatibilityMode)
  }

  function truncateKey (key: string, truncateKeysForCompatibility?: boolean): string {
    if (truncateKeysForCompatibility === false) {
      return key
    }

    if (key.length > maxKeyLength) {
      key = hashKey(key)
    }
    return key
  }

  function hashKey (key: string): string {
    const hash = createHash('sha256')
    hash.update(key)
    return hash.digest('hex')
  }
}
