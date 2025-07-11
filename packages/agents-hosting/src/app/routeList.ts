/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppRoute } from './appRoute'
import { RouteHandler } from './routeHandler'
import { RouteRank } from './routeRank'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

export class RouteList<TState extends TurnState> {
  private _routes: Array<AppRoute<TState>> = []

  public addRoute (
    selector: RouteSelector,
    handler: RouteHandler<TState>,
    isInvokeRoute: boolean = false,
    rank: number = RouteRank.Unspecified,
    authHandlers: string[] = []
  ): this {
    this._routes.push({ selector, handler, isInvokeRoute, rank, authHandlers })

    // Invoke selectors are first, then order by rank ascending
    this._routes.sort((a, b) => {
      if (a.isInvokeRoute !== b.isInvokeRoute) {
        return a.isInvokeRoute ? -1 : 1
      }
      return (a.rank ?? 0) - (b.rank ?? 0)
    })
    return this
  }

  public [Symbol.iterator] (): Iterator<AppRoute<TState>> {
    return this._routes[Symbol.iterator]()
  }
}
