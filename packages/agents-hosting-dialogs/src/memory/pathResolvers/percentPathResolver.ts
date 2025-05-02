/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

/**
 * A path resolver that resolves paths starting with a percent sign ('%')
 * to the 'class.' namespace.
 */
export class PercentPathResolver extends AliasPathResolver {
  /**
   * Initializes a new instance of the PercentPathResolver class.
   * This resolver maps paths starting with '%' to the 'class.' namespace.
   */
  constructor () {
    super('%', 'class.')
  }
}
