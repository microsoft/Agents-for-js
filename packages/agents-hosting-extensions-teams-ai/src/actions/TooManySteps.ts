/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '@microsoft/agents-hosting'

import { AITurnState, TooManyStepsParameters } from '../types'

/**
 * @private
 * @returns {Function} A function that checks if the AI system has exceeded the maximum number of steps or time allowed.
 */
export function tooManySteps<TState extends AITurnState = AITurnState> () {
  return async (_context: TurnContext, _state: TState, data: TooManyStepsParameters) => {
    if (data.step_count > data.max_steps) {
      throw new Error('The AI system has exceeded the maximum number of steps allowed.')
    }

    throw new Error('The AI system has exceeded the maximum amount of time allowed.')
  }
}
