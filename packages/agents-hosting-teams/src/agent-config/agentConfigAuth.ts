/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { SuggestedActions } from '@microsoft/agents-activity'

/**
 * Represents the agent configuration for authentication.
 */
export interface AgentConfigAuth {
  /**
   * Optional suggested actions for the agent.
   */
  suggestedActions?: SuggestedActions
  /**
   * The type of configuration, which is 'auth'.
   */
  type: 'auth'
}
