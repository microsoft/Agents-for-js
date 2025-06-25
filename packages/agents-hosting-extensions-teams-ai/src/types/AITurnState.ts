/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultConversationState, DefaultUserState, DefaultTempState, TurnState } from '@microsoft/agents-hosting'

export interface AIConversationState extends DefaultConversationState {
}

export interface AIUserState extends DefaultUserState {
}

export interface AITempState extends DefaultTempState {
  /**
     * Input passed from the user to the AI Library
     */
  input: string;

  /**
     * Output returned from the last executed action
     */
  lastOutput: string;

  /**
     * All outputs returned from the action sequence that was executed
     */
  actionOutputs: Record<string, string>;
}

export declare class AITurnState<TConversationState = AIConversationState, TUserState = AIUserState, TTempState = AITempState> extends TurnState<TConversationState, TUserState, TTempState> {
}
