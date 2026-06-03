/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Metric, OTel } from '../types.js'

/**
 * Creates metric helpers backed by the package meter.
 */
export function metricFactory (otel: OTel): Metric {
  const meter = otel.metrics.getMeter('@microsoft/agents-telemetry')
  return {
    histogram: meter.createHistogram.bind(meter),
    counter: meter.createCounter.bind(meter),
  }
}
