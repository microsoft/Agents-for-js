/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppRoute } from './appRoute'
import { RouteHandler } from './routeHandler'
import { RouteRank } from './routeRank'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

/**
 * Maintains application routes in dispatch priority order.
 *
 * @typeParam TState - Turn state supplied to route handlers.
 */
export class RouteList<TState extends TurnState> {
  private _routes: Array<AppRoute<TState>> = []

  /**
   * Adds a route and orders it by route kind and rank.
   *
   * @param selector - Selector that determines whether the route matches.
   * @param handler - Handler invoked for a matching route.
   * @param isInvokeRoute - Whether the route handles invoke activities.
   * @param rank - Rank used to order routes of the same kind.
   * @param authHandlers - Authentication handlers required by the route.
   * @param isAgenticRoute - Whether the route handles agentic requests.
   * @returns This route list.
   */
  public addRoute (
    selector: RouteSelector,
    handler: RouteHandler<TState>,
    isInvokeRoute: boolean = false,
    rank: number = RouteRank.Unspecified,
    authHandlers: string[] = [],
    isAgenticRoute: boolean = false
  ): this {
    this._routes.push({ selector, handler, isInvokeRoute, rank, authHandlers, isAgenticRoute })

    // Ordered by:
    //    Agentic + Invoke
    //    Invoke
    //    Agentic
    //    Other
    // Then by Rank
    this._routes.sort((a, b) => {
      const getPriority = (route: AppRoute<TState>) => {
        if (route.isAgenticRoute && route.isInvokeRoute) return 0
        if (route.isInvokeRoute) return 1
        if (route.isAgenticRoute) return 2
        return 3
      }

      const priorityA = getPriority(a)
      const priorityB = getPriority(b)

      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      // If priorities are equal, sort by rank
      return (a.rank ?? 0) - (b.rank ?? 0)
    })

    return this
  }

  /**
   * Iterates over routes in dispatch priority order.
   *
   * @returns An iterator over the registered routes.
   */
  public [Symbol.iterator] (): Iterator<AppRoute<TState>> {
    return this._routes[Symbol.iterator]()
  }
}
