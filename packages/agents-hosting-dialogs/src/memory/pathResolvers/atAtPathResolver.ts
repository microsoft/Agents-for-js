/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

/**
 * A specialized path resolver that replaces the '@@' alias with the prefix 'turn.recognized.entities.'.
 * This is used to resolve paths related to recognized entities in a conversational turn.
 */
export class AtAtPathResolver extends AliasPathResolver {
  /**
   * Initializes a new instance of the AtAtPathResolver class.
   */
  constructor () {
    super('@@', 'turn.recognized.entities.')
  }
}
