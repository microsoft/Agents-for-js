/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ES module entrypoint for agents-telemetry. This file exists alongside index.cts so the package can ship
 * both ESM and CommonJS builds: ESM consumers can use top-level await with dynamic import() fallback loading,
 * while the CommonJS entrypoint keeps a synchronous require()-based implementation for CJS runtimes.
 */

import { index } from './index.js'

export type { TraceDefinition } from './types.js'

export const {
  SpanNames,
  MetricNames,
  debug,
  trace,
  metric,
} = await index({
  otel: () => import('@opentelemetry/api'),
  logs: () => import('@opentelemetry/api-logs'),
})
