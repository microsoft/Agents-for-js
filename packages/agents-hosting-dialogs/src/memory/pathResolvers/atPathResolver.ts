/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

/**
 * A path resolver that replaces the '@' alias with a specific prefix and transforms paths
 * to access recognized entities in a conversational turn. It ensures that the resolved
 * path includes the 'first()' function for entity properties.
 */
export class AtPathResolver extends AliasPathResolver {
  private readonly _prefix = 'turn.recognized.entities.'
  private readonly _delims = ['.', '[']

  /**
   * Initializes a new instance of the AtPathResolver class.
   */
  constructor () {
    super('@', '')
  }

  /**
   * Transforms the path by replacing the '@' alias and appending the 'first()' function
   * to entity properties.
   * @param path The path to inspect and transform.
   * @returns The transformed path.
   */
  transformPath (path: string): string {
    path = path.trim()
    if (path.startsWith('@') && path.length > 1 && !path.startsWith('@@')) {
      let end = -1
      for (let i = 0; i < this._delims.length; i++) {
        const indexOfDelim = path.indexOf(this._delims[i])
        if (indexOfDelim >= 0) {
          end = indexOfDelim
          break
        }
      }
      if (end === -1) {
        end = path.length
      }
      const property = path.substr(1, end - 1)
      const suffix = path.substr(end)
      path = `${this._prefix}${property}.first()${suffix}`
    }

    return path
  }
}
