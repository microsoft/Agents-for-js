/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Framework-agnostic response surface used by the hosting layer.
 *
 * @remarks
 * This interface describes the minimal subset of an HTTP response object that
 * `CloudAdapter.process` and `authorizeJWT` need at runtime. Any framework whose
 * response object structurally satisfies this shape is compatible — including
 * Express's `Response`, and adapter classes such as `FastifyReplyAdapter` from
 * `@microsoft/agents-hosting-fastify`.
 *
 * Keeping this contract in the core hosting package means the hosting layer no
 * longer needs to import types from `express` at compile time.
 */
export interface WebResponse {
  status (code: number): this
  setHeader (name: string, value: string): this
  send (body?: unknown): this
  end (): this
  headersSent: boolean
  writableEnded: boolean
}

/**
 * Framework-agnostic `next` callback used by middleware-style functions in the
 * hosting layer (notably `authorizeJWT`). Mirrors the shape of Express's
 * `NextFunction` so existing Express middleware continues to work unchanged.
 */
export type NextFunction = (err?: any) => void

/**
 * Minimal HTTP request shape used by framework-agnostic route handlers.
 *
 * @remarks
 * Augments {@link WebRequestParamsCarrier} so handlers can read URL params
 * (`req.params.conversationId`) without coupling to Express's `Request` type.
 */
export interface WebRequestParamsCarrier {
  params?: Record<string, string | undefined>
}
