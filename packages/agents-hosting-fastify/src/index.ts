/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export * from './startServer'
export * from './createAgentRequestHandler'
export * from './replyAdapter'
export * from './configureResponseController'
export { default, default as agentsHostingFastifyPlugin } from './plugin'
export type { AgentsHostingFastifyPluginOptions } from './plugin'
// Re-export createCloudAdapter from core so users of the Fastify package can configure adapters
// without an additional dependency on @microsoft/agents-hosting-express.
export { createCloudAdapter, type CloudAdapterResult } from '@microsoft/agents-hosting'
