// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpanNames, trace } from '@microsoft/agents-telemetry'
import { CosmosStorageMetrics } from './metrics'

export const CosmosStorageTraceDefinitions = {
  read: trace.define({
    name: SpanNames.STORAGE_READ,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'read',
        'storage.key.count': record.keyCount ?? 0,
      }

      span.setAttributes(attributes)
      CosmosStorageMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
  write: trace.define({
    name: SpanNames.STORAGE_WRITE,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'write',
        'storage.key.count': record.keyCount ?? 0,
      }

      span.setAttributes(attributes)
      CosmosStorageMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
  delete: trace.define({
    name: SpanNames.STORAGE_DELETE,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'delete',
        'storage.key.count': record.keyCount ?? 0,
      }

      span.setAttributes(attributes)
      CosmosStorageMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
}
