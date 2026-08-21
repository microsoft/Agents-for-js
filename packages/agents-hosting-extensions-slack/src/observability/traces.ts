// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpanNames, trace } from '@microsoft/agents-telemetry'
import { SlackMetrics } from './metrics.js'

export const SlackTraceDefinitions = {
  apiCall: trace.define({
    name: SpanNames.SLACK_API_CALL,
    record: {
      method: '',
      httpStatusCode: 'unknown',
      slackErrorCode: '',
    },
    end ({ span, record, duration, error }) {
      const attributes = {
        'slack.api.method': record.method || 'unknown',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode,
        ...(record.slackErrorCode && { 'slack.api.error_code': record.slackErrorCode }),
      }

      span.setAttributes({
        ...attributes,
        'server.address': 'slack.com',
      })

      const metricAttributes = {
        ...attributes,
        'operation.success': error === undefined,
      }

      SlackMetrics.apiRequestsCounter.add(1, metricAttributes)
      SlackMetrics.apiRequestDuration.record(duration, metricAttributes)
    }
  })
}
