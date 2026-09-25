/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyReply } from 'fastify'
import type { WebResponse } from '@microsoft/agents-hosting'

/**
 * Class-based adapter that wraps a {@link FastifyReply} so it satisfies the
 * structural {@link WebResponse} interface expected by `CloudAdapter.process`
 * and `authorizeJWT` from `@microsoft/agents-hosting`.
 *
 * Methods are chainable (return `this`). `send()` and `end()` are no-ops after
 * the reply has already been sent. `headersSent` and `writableEnded` both
 * derive from `reply.sent`, which collapses Express's separate guards into one
 * boolean.
 */
export class FastifyReplyAdapter implements WebResponse {
  constructor (private readonly reply: FastifyReply) {}

  get headersSent (): boolean {
    return this.reply.sent
  }

  get writableEnded (): boolean {
    return this.reply.sent
  }

  status (code: number): this {
    this.reply.status(code)
    return this
  }

  setHeader (name: string, value: string): this {
    this.reply.header(name, value)
    return this
  }

  send (body?: unknown): this {
    if (!this.reply.sent) {
      this.reply.send(body)
    }
    return this
  }

  end (): this {
    if (!this.reply.sent) {
      this.reply.send()
    }
    return this
  }
}

/**
 * Adapts a {@link FastifyReply} to the structural {@link WebResponse} interface.
 *
 * @param reply - The Fastify reply object.
 * @returns A reply adapter satisfying the {@link WebResponse} contract.
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
