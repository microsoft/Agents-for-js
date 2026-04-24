/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * CommonJS entrypoint for agents-telemetry. This file exists alongside index.mts so the package can ship
 * both CommonJS and ESM builds: CommonJS consumers need synchronous require()-based loading, while the ESM
 * entrypoint uses async import() fallback loading that is only valid in an ES module.
 */

import type { OTel, OTelLogs } from './types.js'
import { index } from './index.js'

export type { TraceDefinition } from './types.js'

export const {
  SpanNames,
  MetricNames,
  debug,
  trace,
  metric,
} = index({
  otel: () => require('@opentelemetry/api') as OTel,
  logs: () => require('@opentelemetry/api-logs') as OTelLogs,
})
