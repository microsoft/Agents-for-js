/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines the priority ranking for route evaluation in the agent hosting framework.
 * Routes are evaluated in ascending order of their rank values, allowing for precise
 * control over which routes are processed first when multiple routes could match
 * the same request.
 *
 * @example
 * ```typescript
 * // High priority route that should be evaluated first
 * app.addRoute('/api/urgent', handler, RouteRank.First);
 *
 * // Normal priority route with default ranking
 * app.addRoute('/api/data', handler, RouteRank.Unspecified);
 *
 * // Fallback route that should be evaluated last
 * app.addRoute('/api/*', fallbackHandler, RouteRank.Last);
 * ```
 */
export enum RouteRank {
  /**
   * Highest priority rank (value: 0). Routes with this rank are evaluated first
   * before any other routes. Use this for critical routes that must take precedence
   * over all others, such as authentication endpoints or emergency handlers.
   */
  First = 0,

  /**
   * Lowest priority rank (value: Number.MAX_VALUE). Routes with this rank are
   * evaluated last, after all other routes have been considered. Ideal for
   * catch-all routes, fallback handlers, or default error pages that should
   * only match when no other routes apply.
   */
  Last = Number.MAX_VALUE,

  /**
   * Default priority rank (value: Number.MAX_VALUE / 2). This is the standard
   * rank for most routes that don't require special ordering. Routes with this
   * rank are evaluated after high-priority routes but before low-priority ones.
   * Use this when you don't need to specify a particular evaluation order.
   */
  Unspecified = Number.MAX_VALUE / 2
}
