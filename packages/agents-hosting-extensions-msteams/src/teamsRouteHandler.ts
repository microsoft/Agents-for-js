// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { RouteHandler, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsTurnContext } from './teamsTurnContext'

/**
 * Route handler that receives a Teams-specific turn context.
 */
export type TeamsRouteHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState) => Promise<void>

/**
 * Wraps a Teams route handler so it can be registered with an agent application route.
 *
 * @param handler - Handler that expects a Teams turn context.
 * @returns A route handler that creates a Teams turn context for the current turn.
 */
export function createTeamsRouteHandler<TState extends TurnState> (handler: TeamsRouteHandler<TState>): RouteHandler<TState> {
  return async (context: TurnContext, state: TState) => {
    await handler(new TeamsTurnContext(context), state)
  }
}
