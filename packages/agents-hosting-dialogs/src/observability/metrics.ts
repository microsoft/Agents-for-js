// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metric, MetricNames } from '@microsoft/agents-telemetry'

export const DialogsMetrics = {
  contextCount: metric.counter(MetricNames.DIALOGS_CONTEXT_COUNT, {
    unit: 'operations',
    description: 'Total number of dialog context operations'
  }),

  contextDuration: metric.histogram(MetricNames.DIALOGS_CONTEXT_DURATION, {
    unit: 'ms',
    description: 'Duration of dialog context operations in milliseconds'
  })
}
