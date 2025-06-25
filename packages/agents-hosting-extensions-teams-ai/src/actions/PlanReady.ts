/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '@microsoft/agents-hosting'

import { Plan } from '../planners'
import { StopCommandName } from './Action'
import { AITurnState } from '../types'

/**
 * @private
 * @returns {Function} A function that takes TurnContext, TState, and Plan as arguments and returns a string or StopCommandName.
 */
export function planReady<TState extends AITurnState = AITurnState> () {
  return async (_context: TurnContext, _state: TState, plan: Plan) => {
    return Array.isArray(plan.commands) && plan.commands.length > 0 ? '' : StopCommandName
  }
}
