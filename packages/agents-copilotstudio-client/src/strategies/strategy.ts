/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Strategy {
  getConversationUrl(conversationId?: string): string;
}

/**
 * Settings required to configure the BotStrategy.
 */
export interface StrategySettings {
  /**
   * The host URL of the Copilot Studio service.
   */
  readonly host: URL;

  /**
   * The schema identifier for the agent.
   */
  readonly schema: string;
}
