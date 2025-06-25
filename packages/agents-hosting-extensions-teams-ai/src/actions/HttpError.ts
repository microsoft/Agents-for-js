/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '@microsoft/agents-hosting'
import { AITurnState } from '../types'

/**
 * @private
 * @returns {Promise<string>} A promise that resolves to a string.
 */
export function httpError<TState extends AITurnState = AITurnState> () {
  return async (_context: TurnContext, _state: TState, err?: Error): Promise<string> => {
    throw err || new Error('An AI http request failed')
  }
}
