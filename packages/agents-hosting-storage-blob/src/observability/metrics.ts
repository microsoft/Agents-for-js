// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metric, MetricNames } from '@microsoft/agents-telemetry'

export const BlobsStorageMetrics = {
  storageOperationDuration: metric.histogram(MetricNames.STORAGE_OPERATION_DURATION, {
    unit: 'ms',
    description: 'Duration of storage operations in milliseconds'
  })
}
