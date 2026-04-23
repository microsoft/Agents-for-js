/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Factory, Loader, LoaderReturn, OTel, OTelLogs, } from './types.js'
import { traceFactory } from './observability/trace.js'
import { metricFactory } from './observability/metric.js'
import { createDebugLogger, link } from './loggers/debug.js'
import { createOTelLogger } from './loggers/otel.js'
import { attempt, isPromise } from './utils/attempt.js'

import { SpanNames, MetricNames } from './observability/constants.js'
import { noopMetric, noopTrace } from './utils/noop.js'

const logger = createDebugLogger('agents:telemetry')

/**
 * Loads the optional OpenTelemetry dependencies and returns the telemetry factory used by the package entrypoints.
 *
 * @remarks
 * - The loader can be synchronous or asynchronous.
 * - Missing optional dependencies only disable the related feature and emit a warning.
 */
export function index<TLoader extends Loader> (loader: TLoader): LoaderReturn<TLoader> {
  const otel = attempt({
    try: () => loader.otel() as OTel,
    catch: () => logger.warn('OpenTelemetry API not found. Install @opentelemetry/api as a dependency to enable tracing and metrics.')
  })

  const logs = attempt({
    try: () => loader.logs() as OTelLogs,
    catch: () => logger.warn('OpenTelemetry API Logs not found. Install @opentelemetry/api-logs as a dependency to enable OTel logging.')
  })

  if (isPromise(otel) || isPromise(logs)) {
    return Promise.all([otel, logs])
      .then(([otel, logs]) => factory(otel, logs)) as LoaderReturn<TLoader>
  }

  return factory(otel, logs) as LoaderReturn<TLoader>
}

/**
 * Creates the runtime telemetry surface exposed by the package.
 *
 * @remarks
 * - Logging combines debug output with OpenTelemetry logs when log support is available.
 * - Trace and metric helpers fall back to no-op implementations when the OTel API is not installed.
 */
function factory (otel?: OTel, logs?: OTelLogs): Factory {
  return {
    SpanNames,
    MetricNames,
    debug: logs ? ns => link(createDebugLogger(ns), createOTelLogger(logs, ns)) : createDebugLogger,
    trace: otel ? traceFactory(otel) : noopTrace,
    metric: otel ? metricFactory(otel) : noopMetric(),
  }
}
