/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RequestHandler } from "express";
import { fileURLToPath } from "url";

/**
 * Serves the specified library from the node_modules directory.
 */
export function dependency(library: string): RequestHandler {
  return (req, res, next) =>
    req.url.startsWith(`/${library}`)
      ? res.sendFile(fileURLToPath(import.meta.resolve(library)))
      : next();
}
