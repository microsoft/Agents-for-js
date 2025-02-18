/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { JwtPayload } from 'jsonwebtoken'

/**
 * Represents a Node.js HTTP Request, including the minimal set of use properties.
 * Compatible with Restify, Express, and Node.js core http.
 */
export interface Request<
    Body extends Record<string, unknown> = Record<string, unknown>,
    Headers extends Record<string, string[] | string | undefined> = Record<string, string[] | string | undefined>
> {
  body?: Body
  headers: Headers
  method?: string
  user?: JwtPayload
}
