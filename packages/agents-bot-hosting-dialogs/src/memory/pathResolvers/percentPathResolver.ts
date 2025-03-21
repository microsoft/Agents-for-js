/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AliasPathResolver } from './aliasPathResolver'

export class PercentPathResolver extends AliasPathResolver {
  /**
     * Initializes a new instance of the PercentPathResolver class.
     */
  constructor () {
    super('%', 'class.')
  }
}
