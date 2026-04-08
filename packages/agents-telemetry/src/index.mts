/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ES module entrypoint for agents-telemetry. This file exists alongside index.cts so the package can ship
 * both ESM and CommonJS builds: ESM consumers can use top-level await with dynamic import() fallback loading,
 * while the CommonJS entrypoint keeps a synchronous require()-based implementation for CJS runtimes.
 */

import { factory } from './factory.js'
import { startManagedSpan } from './traces/trace.js'
import { loadTelemetryDependencies } from './utils/load.js'

export { SpanNames, MetricNames } from './traces/constants.js'
export type { ManagedSpanOptions, ManagedSpanResult } from './traces/trace.js'

const [_otel, logs] = await loadTelemetryDependencies(
  [() => import('@opentelemetry/api'), () => import('@microsoft/agents-opentelemetry-api')],
  [() => import('@opentelemetry/api-logs'), () => import('@microsoft/agents-opentelemetry-api-logs')]
)

export const otel = _otel
export const managedSpan = startManagedSpan(otel)
export const { trace, debug } = factory(otel, logs)
