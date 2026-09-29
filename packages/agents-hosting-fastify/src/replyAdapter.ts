/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyReply } from 'fastify'
import type { WebResponse } from '@microsoft/agents-hosting'

/**
 * Class-based adapter that wraps a `FastifyReply` so it satisfies the
 * structural {@link @microsoft/agents-hosting.WebResponse} interface expected by `CloudAdapter.process`
 * and `authorizeJWT` from `@microsoft/agents-hosting`.
 *
 * Methods are chainable (return `this`). `send()` and `end()` are no-ops after
 * the reply has already been sent. `headersSent` and `writableEnded` both
 * derive from `reply.sent`, which collapses Express's separate guards into one
 * boolean.
 */
export class FastifyReplyAdapter implements WebResponse {
  constructor (private readonly reply: FastifyReply) {}

  /** Indicates whether response headers have already been sent. */
  get headersSent (): boolean {
    return this.reply.sent
  }

  /** Indicates whether the response has finished writing. */
  get writableEnded (): boolean {
    return this.reply.sent
  }

  /**
   * Sets the HTTP response status code.
   *
   * @param code The HTTP status code.
   * @returns This adapter for chaining.
   */
  status (code: number): this {
    this.reply.status(code)
    return this
  }

  /**
   * Sets an HTTP response header.
   *
   * @param name The header name.
   * @param value The header value.
   * @returns This adapter for chaining.
   */
  setHeader (name: string, value: string): this {
    this.reply.header(name, value)
    return this
  }

  /**
   * Sends the response body unless the reply has already been sent.
   *
   * @param body The optional response body.
   * @returns This adapter for chaining.
   */
  send (body?: unknown): this {
    if (!this.reply.sent) {
      this.reply.send(body)
    }
    return this
  }

  /**
   * Ends the response unless the reply has already been sent.
   *
   * @returns This adapter for chaining.
   */
  end (): this {
    if (!this.reply.sent) {
      this.reply.send()
    }
    return this
  }
}

/**
 * Adapts `FastifyReply` to the structural {@link @microsoft/agents-hosting.WebResponse} interface.
 *
 * @param reply - The Fastify reply object.
 * @returns A reply adapter satisfying the {@link @microsoft/agents-hosting.WebResponse} contract.
 */
export const adaptReply = (reply: FastifyReply): WebResponse => new FastifyReplyAdapter(reply)

/**
 * Compile-time contract guard — no runtime effect; type-checked by `npm run build`.
 *
 * Locks in that {@link FastifyReplyAdapter} fully satisfies {@link WebResponse},
 * independently of the `implements` clause above. If `WebResponse` ever drifts — e.g.
 * it gains or changes a member — this line fails to compile, surfacing the break here
 * at build time rather than at a `CloudAdapter.process` / `authorizeJWT` call site.
 */
type AssertAssignable<Target, Source extends Target> = Source
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _FastifyReplyAdapterSatisfiesWebResponse = AssertAssignable<WebResponse, FastifyReplyAdapter>
