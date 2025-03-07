/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

export interface AppRoute<TState extends TurnState> {
  selector: RouteSelector;
  handler: RouteHandler<TState>;
}
