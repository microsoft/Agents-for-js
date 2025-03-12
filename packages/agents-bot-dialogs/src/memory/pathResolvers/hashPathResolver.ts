/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

export class HashPathResolver extends AliasPathResolver {
  /**
     * Initializes a new instance of the HashPathResolver class.
     */
  constructor () {
    super('#', 'turn.recognized.intents.')
  }
}
