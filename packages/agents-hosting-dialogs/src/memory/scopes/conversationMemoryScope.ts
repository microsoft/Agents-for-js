/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AgentStateMemoryScope } from './agentStateMemoryScope'
import { ScopePath } from '../scopePath'

/**
 * Memory that's scoped to the current conversation.
 */
export class ConversationMemoryScope extends AgentStateMemoryScope {
  protected stateKey = 'ConversationState'
  /**
     * Initializes a new instance of the ConversationMemoryScope class.
     */
  constructor () {
    super(ScopePath.conversation)
  }
}
