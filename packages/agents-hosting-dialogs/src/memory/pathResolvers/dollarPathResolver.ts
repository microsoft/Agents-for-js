/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

/**
 * A path resolver that resolves paths starting with a dollar sign ('$')
 * to the 'dialog.' namespace.
 */
export class DollarPathResolver extends AliasPathResolver {
  /**
   * Initializes a new instance of the DollarPathResolver class.
   * This resolver maps paths starting with '$' to the 'dialog.' namespace.
   */
  constructor () {
    super('$', 'dialog.')
  }
}
