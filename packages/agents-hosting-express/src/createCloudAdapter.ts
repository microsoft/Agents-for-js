/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Re-export from `@microsoft/agents-hosting` for backward compatibility.
 * `createCloudAdapter` was moved into core so it can be reused by Fastify and
 * other hosting integrations without dragging the Express runtime along.
 */

export { createCloudAdapter, type CloudAdapterResult } from '@microsoft/agents-hosting'
