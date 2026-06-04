// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpanNames, trace } from '@microsoft/agents-telemetry'
import { NamedPipeMetrics } from './metrics.js'

export const NamedPipeTraceDefinitions = {
  connect: trace.define({
    name: SpanNames.NAMED_PIPE_CONNECT,
    record: {
      pipeName: '',
    },
    end ({ span, record }) {
      span.setAttribute('agents.named_pipe.pipe_name', record.pipeName)
      NamedPipeMetrics.connectionsCounter.add(1)
    }
  }),

  dispatch: trace.define({
    name: SpanNames.NAMED_PIPE_DISPATCH,
    record: {
      verb: '',
      path: '',
      statusCode: 0,
    },
    end ({ span, record, duration, error }) {
      span.setAttributes({
        'agents.named_pipe.request.verb': record.verb,
        'agents.named_pipe.request.path': record.path,
        'agents.named_pipe.response.status_code': record.statusCode,
      })

      const attributes = {
        'request.verb': record.verb,
        'request.path': record.path,
      }

      NamedPipeMetrics.dispatchesCounter.add(1, attributes)
      NamedPipeMetrics.dispatchDuration.record(duration, attributes)

      if (error) {
        NamedPipeMetrics.dispatchErrorsCounter.add(1, {
          'error.type': error instanceof Error ? error.constructor.name : typeof error
        })
      }
    }
  }),

  send: trace.define({
    name: SpanNames.NAMED_PIPE_SEND,
    record: {
      statusCode: 0,
      bodySize: 0,
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'agents.named_pipe.response.status_code': record.statusCode,
        'agents.named_pipe.response.body_size': record.bodySize,
      })

      NamedPipeMetrics.sendsCounter.add(1)
      NamedPipeMetrics.sendDuration.record(duration)
    }
  })
}
