/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AgentStateMemoryScope } from './agentStateMemoryScope'
import { ScopePath } from '../scopePath'

/**
 * Memory that's scoped to the current user.
 */
export class UserMemoryScope extends AgentStateMemoryScope {
  protected stateKey = 'UserState'
  /**
     * Initializes a new instance of the UserMemoryScope class.
     */
  constructor () {
    super(ScopePath.user)
  }
}
