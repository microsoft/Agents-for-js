/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

export interface AppRoute<TState extends TurnState> {
  /**
   * The selector function used to determine if this route should handle the current activity.
   */
  selector: RouteSelector;

  /**
   * The handler function that processes the activity if the selector matches.
   */
  handler: RouteHandler<TState>;

  /**
   * Indicates whether this route is an invoke route.
   * Invoke routes are used for specific types of activities, such as messaging extensions.
   */
  isInvokeRoute?: boolean;
}
