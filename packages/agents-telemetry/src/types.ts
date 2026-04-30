/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Logger } from './loggers/base.js'
import { MetricNames, SpanNames } from './observability/constants.js'
import type { Span, Meter } from '@opentelemetry/api'

/**
 * These type re-exports are intentional.
 *
 * @remarks
 * This package is primarily a shared telemetry layer for other Agents SDK packages, so its
 * TypeScript surface may depend on OpenTelemetry types even when runtime loading falls back
 * to noop behavior if the optional dependencies are absent.
 */
export type * from '@opentelemetry/api'
export type { Span, Meter } from '@opentelemetry/api'
export type * from '@opentelemetry/api-logs'

/**
 * Runtime type for the optional OpenTelemetry API module.
 */
export type OTel = typeof import('@opentelemetry/api')

/**
 * Runtime type for the optional OpenTelemetry logs module.
 */
export type OTelLogs = typeof import('@opentelemetry/api-logs')

/**
 * Union of the supported span names exposed by the package constants.
 */
export type SpanName = typeof SpanNames[keyof typeof SpanNames]

/**
 * Mutable state container used while a trace is active.
 *
 * @remarks
 * - `set()` performs a shallow merge.
 * - `get()` returns the latest snapshot stored for the span.
 */
export interface TraceRecord<TRecord extends object> {
  set(values: Partial<TRecord>): void
  get(): Readonly<TRecord>
}

/**
 * Context passed to traced callbacks.
 */
export interface TraceContext<TRecord extends object, TActions extends object> {
  record(values: Partial<TRecord>): void
  actions: TActions
}

/**
 * Callback used by callback-based trace execution.
 */
export type TraceCallback<TRecord extends object, TActions extends object, TReturn = unknown> =
  (context: TraceContext<TRecord, TActions>) => TReturn

/**
 * Context used to create action helpers backed by the underlying span.
 */
export interface TraceActionsContext {
  span: Span
}

/**
 * Data provided to the `end` hook when a trace finishes.
 */
export interface TraceEndContext<TRecord extends object> {
  span: Span
  record: Readonly<TRecord>
  duration: number
  error?: unknown
}

/**
 * Handle returned when a trace is created without a callback.
 */
export interface TraceManagedContext<TRecord extends object, TActions extends object> extends TraceContext<TRecord, TActions> {
  end(): void
  fail<T extends unknown>(error: T): T
}

/**
 * Declares how a span should be created, enriched, and finalized.
 *
 * @remarks
 * - `name` must come from `SpanNames`.
 * - `record` provides the default shape for values collected during the span lifetime.
 */
export interface TraceDefinition<TRecord extends object = Record<string, never>, TActions extends object = Record<string, Function>> {
  name: SpanName
  record: TRecord
  actions?(context: TraceActionsContext): TActions
  end(context: TraceEndContext<TRecord>): void
}

/**
 * Trace helper that supports both managed spans and callback-based spans.
 */
export interface TraceFunction {
  define<TRecord extends object, TActions extends object>(definition: TraceDefinition<TRecord, TActions>): TraceDefinition<TRecord, TActions>
  <TRecord extends object, TActions extends object>(definition: TraceDefinition<TRecord, TActions>): TraceManagedContext<TRecord, TActions>
  <TRecord extends object, TActions extends object, TReturn>(definition: TraceDefinition<TRecord, TActions>, callback: TraceCallback<TRecord, TActions, TReturn>): TReturn
}

/**
 * Metric factory surface exposed by the package.
 */
export interface Metric {
  histogram: Meter['createHistogram']
  counter: Meter['createCounter']
}

/**
 * Loader interface for the index function, which conditionally loads OpenTelemetry dependencies at runtime.
 */
export interface Loader {
  otel(): OTel | Promise<OTel>
  logs(): OTelLogs | Promise<OTelLogs>
}

/**
 * Conditional return type for the index loader function, based on whether the loader returns Promises.
 */
export type LoaderReturn<TLoader extends Loader> = Extract<ReturnType<TLoader['otel']> | ReturnType<TLoader['logs']>, PromiseLike<unknown>> extends never ? Factory : Promise<Factory>

/**
 * Public telemetry API exported by the package entrypoints.
 */
export interface Factory {
  SpanNames: typeof SpanNames,
  MetricNames: typeof MetricNames,
  /**
   * Creates a namespaced logger.
   *
    * @remarks
   * - Debug output is always used.
   * - When the OTel logs API is available, messages are mirrored to OpenTelemetry logs.
   */
  debug(namespace: string): Logger

  /**
   * Starts spans from a `TraceDefinition`.
   */
  trace: TraceFunction

  /**
   * Exposes histogram and counter creators from the package meter.
   */
  metric: Metric
}

/**
 * Options used by the shared `attempt()` helper.
 *
 * @remarks
 * - Omitting catch preserves the original error.
 * - catch is for side effects only; recovery values are not used.
 * - Declare catch as returning never when it always rethrows.
 * - Declare catch as returning void when it may swallow the failure.
 */
export interface AttemptOptions<TResult, TCatch = never> {
  try(): TResult,
  catch?(error: unknown): TCatch,
  finally?(): void
}
