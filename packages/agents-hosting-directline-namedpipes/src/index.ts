// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export { NamedPipeService, startNamedPipeServer, type NamedPipeServerOptions } from './namedPipeServer.js'
export { NamedPipeMessageHandler } from './namedPipeMessageHandler.js'
export { type NamedPipeResponse, ok, accepted, notFound, internalServerError } from './protocol/namedPipeResponse.js'
export { createLocalAdapter } from './createLocalAdapter.js'
