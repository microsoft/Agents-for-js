// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { createDebugLogger } from '../loggers/debug.js'
import { attempt, isPromise } from './attempt.js'

const logger = createDebugLogger('agents:telemetry')

type LoadFactory<TResult> = () => TResult
type LoadPair<TResult> = readonly [LoadFactory<TResult>, LoadFactory<TResult>]

/**
 * Attempts to load the OpenTelemetry API and Logs API from the provided primary loader pairs. If either primary
 * loader fails, it falls back to the bundled '@microsoft/agents-opentelemetry-api' or
 * '@microsoft/agents-opentelemetry-api-logs' loader respectively. This allows agents-telemetry to operate in
 * environments where OpenTelemetry is not present, while still enabling full functionality when it is.
 * @param _otel The primary and fallback loaders for the OpenTelemetry API.
 * @param _logs The primary and fallback loaders for the OpenTelemetry Logs API.
 * @returns A tuple containing the loaded OpenTelemetry API and Logs API. When both loader pairs are async, the
 * tuple is returned as a Promise with both values resolved. When both loader pairs are sync, the tuple is returned
 * synchronously.
 */
export function loadTelemetryDependencies <TOtel, TLogs> (_otel: LoadPair<Promise<TOtel>>, _logs: LoadPair<Promise<TLogs>>): Promise<[TOtel, TLogs]>
export function loadTelemetryDependencies <TOtel, TLogs> (_otel: LoadPair<TOtel>, _logs: LoadPair<TLogs>): [TOtel, TLogs]
export function loadTelemetryDependencies <TOtel, TLogs> (_otel: LoadPair<TOtel>, _logs: LoadPair<TLogs>): [TOtel, TLogs] | Promise<[Awaited<TOtel>, Awaited<TLogs>]> {
  const [otelApi, otelFallback] = _otel
  const otel = attempt({
    try: otelApi,
    catch: () => {
      logger.warn('Missing OpenTelemetry API. Falling back to bundled version. To enable full functionality, install @opentelemetry/api as a dependency.')
      return attempt({
        try: otelFallback,
        catch: (fallbackError) => {
          logger.error('Failed to load bundled OpenTelemetry API fallback.')
          throw fallbackError
        }
      })
    }
  })

  const [otelLogs, otelLogsFallback] = _logs
  const logs = attempt({
    try: otelLogs,
    catch: () => {
      logger.warn('Missing OpenTelemetry Logs API. Falling back to bundled version. To enable full functionality, install @opentelemetry/api-logs as a dependency.')
      return attempt({
        try: otelLogsFallback,
        catch: (fallbackError) => {
          logger.error('Failed to load bundled OpenTelemetry Logs API fallback.')
          throw fallbackError
        }
      })
    }
  })

  if (isPromise(otel) || isPromise(logs)) {
    return Promise.all([otel, logs]) as Promise<[Awaited<TOtel>, Awaited<TLogs>]>
  }

  return [otel, logs]
}
