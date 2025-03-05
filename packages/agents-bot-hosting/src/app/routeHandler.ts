/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { TurnState } from './turnState'

/**
 * Function for handling an incoming request.
 * @template TState Type of the turn state.
 * @param context Context for the current turn of conversation with the user.
 * @param state Current turn state.
 * @returns A promise that resolves when the handler completes its processing.
 */
export type RouteHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<void>
