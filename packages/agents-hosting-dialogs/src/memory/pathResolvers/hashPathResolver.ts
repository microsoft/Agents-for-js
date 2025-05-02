/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

/**
 * A path resolver that resolves paths starting with a hash sign ('#')
 * to the 'turn.recognized.intents.' namespace.
 */
export class HashPathResolver extends AliasPathResolver {
  /**
   * Initializes a new instance of the HashPathResolver class.
   * This resolver maps paths starting with '#' to the 'turn.recognized.intents.' namespace.
   */
  constructor () {
    super('#', 'turn.recognized.intents.')
  }
}
