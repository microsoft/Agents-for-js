/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * CommonJS entrypoint for agents-telemetry. This file exists alongside index.mts so the package can ship
 * both CommonJS and ESM builds: CommonJS consumers need synchronous require()-based loading, while the ESM
 * entrypoint uses async import() fallback loading that is only valid in an ES module.
 */

import { startManagedSpan } from './traces/trace.js'
import { loadTelemetryDependencies } from './utils/load.js'
import { factory } from './factory.js'

export { SpanNames, MetricNames } from './traces/constants.js'
export type { ManagedSpanOptions, ManagedSpanResult } from './traces/trace.js'

const [_otel, logs] = loadTelemetryDependencies(
  [() => require('@opentelemetry/api'), () => require('@microsoft/agents-opentelemetry-api')],
  [() => require('@opentelemetry/api-logs'), () => require('@microsoft/agents-opentelemetry-api-logs')]
)

export const otel = _otel
export const managedSpan = startManagedSpan(otel)
export const { trace, debug } = factory(otel, logs)
