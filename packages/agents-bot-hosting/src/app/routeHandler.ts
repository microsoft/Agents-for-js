/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { TurnState } from './turnState'

export type RouteHandler<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<void>
