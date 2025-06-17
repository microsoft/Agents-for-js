/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler } from 'express'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/**
 * Serves the specified library from the node_modules directory.
 */
export function dependency (library: string): RequestHandler {
  return (req, res, next) => {
    if (req.url !== `/${library}`) {
      next()
    }

    return res.sendFile(require.resolve(library))
  }
}
