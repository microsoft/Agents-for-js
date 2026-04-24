// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpanNames, trace } from '@microsoft/agents-telemetry'
import { DialogsMetrics } from './metrics'
import { Activity } from '@microsoft/agents-activity'

const unknownValue = (value?: string): string => value || 'unknown'
const defaultActivity = Activity.fromObject({ type: 'unknown' })

export const DialogsTraceDefinitions = {
  run: trace.define({
    name: SpanNames.DIALOGS_RUN,
    record: {
      dialogId: '',
      activity: defaultActivity,
      status: 'unknown',
      attemptCount: 0,
    },
    end ({ span, record }) {
      span.setAttributes({
        'dialog.root_id': unknownValue(record.dialogId),
        'activity.type': unknownValue(record.activity?.type),
        'activity.channel_id': unknownValue(record.activity?.channelId),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.status': unknownValue(record.status),
        'dialog.attempt_count': record.attemptCount ?? 0,
      })
    }
  }),

  contextBegin: trace.define({
    name: SpanNames.DIALOGS_CONTEXT_BEGIN,
    record: {
      dialogId: '',
      name: 'unknown',
      parentId: '',
      status: 'unknown',
      activity: defaultActivity,
    },
    end ({ span, record, duration }) {
      const spanAttributes = {
        'activity.type': unknownValue(record.activity?.type),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.id': unknownValue(record.dialogId),
        'dialog.name': unknownValue(record.name),
        'dialog.parent_id': unknownValue(record.parentId),
        'dialog.status': unknownValue(record.status),
      }

      span.setAttributes(spanAttributes)

      const metricAttributes = {
        operation: 'begin',
        'result.status': unknownValue(record.status),
      }

      DialogsMetrics.contextCount.add(1, metricAttributes)
      DialogsMetrics.contextDuration.record(duration, metricAttributes)
    }
  }),

  contextContinue: trace.define({
    name: SpanNames.DIALOGS_CONTEXT_CONTINUE,
    record: {
      dialogId: '',
      name: 'unknown',
      status: 'unknown',
      activity: defaultActivity,
    },
    end ({ span, record, duration }) {
      const spanAttributes = {
        'activity.type': unknownValue(record.activity?.type),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.id': unknownValue(record.dialogId),
        'dialog.name': unknownValue(record.name),
        'dialog.status': unknownValue(record.status),
      }

      span.setAttributes(spanAttributes)

      const metricAttributes = {
        operation: 'continue',
        'result.status': unknownValue(record.status),
      }

      DialogsMetrics.contextCount.add(1, metricAttributes)
      DialogsMetrics.contextDuration.record(duration, metricAttributes)
    }
  }),

  contextEnd: trace.define({
    name: SpanNames.DIALOGS_CONTEXT_END,
    record: {
      activity: defaultActivity,
      dialogId: '',
      name: 'unknown',
      status: 'unknown',
    },
    end ({ span, record, duration }) {
      const spanAttributes = {
        'activity.type': unknownValue(record.activity?.type),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.id': unknownValue(record.dialogId),
        'dialog.name': unknownValue(record.name),
        'dialog.status': unknownValue(record.status),
      }

      span.setAttributes(spanAttributes)

      const metricAttributes = {
        operation: 'end',
        'result.status': unknownValue(record.status),
      }

      DialogsMetrics.contextCount.add(1, metricAttributes)
      DialogsMetrics.contextDuration.record(duration, metricAttributes)
    }
  }),

  contextReplace: trace.define({
    name: SpanNames.DIALOGS_CONTEXT_REPLACE,
    record: {
      activity: defaultActivity,
      dialogId: '',
      name: 'unknown',
      replacementDialogId: '',
      replacementName: 'unknown',
      status: 'unknown',
    },
    end ({ span, record, duration }) {
      const spanAttributes = {
        'activity.type': unknownValue(record.activity?.type),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.id': unknownValue(record.dialogId),
        'dialog.name': unknownValue(record.name),
        'dialog.replacement_id': unknownValue(record.replacementDialogId),
        'dialog.replacement_name': unknownValue(record.replacementName),
        'dialog.status': unknownValue(record.status),
      }

      span.setAttributes(spanAttributes)

      const metricAttributes = {
        operation: 'replace',
        'result.status': unknownValue(record.status),
      }

      DialogsMetrics.contextCount.add(1, metricAttributes)
      DialogsMetrics.contextDuration.record(duration, metricAttributes)
    }
  }),

  contextCancelAll: trace.define({
    name: SpanNames.DIALOGS_CONTEXT_CANCEL_ALL,
    record: {
      activity: defaultActivity,
      cancelParents: false,
      dialogId: '',
      eventName: '',
      name: 'unknown',
      status: 'unknown',
    },
    end ({ span, record, duration }) {
      const spanAttributes = {
        'activity.type': unknownValue(record.activity?.type),
        'activity.conversation_id': unknownValue(record.activity?.conversation?.id),
        'dialog.cancel_parents': record.cancelParents,
        'dialog.event_name': unknownValue(record.eventName),
        'dialog.id': unknownValue(record.dialogId),
        'dialog.name': unknownValue(record.name),
        'dialog.status': unknownValue(record.status),
      }

      span.setAttributes(spanAttributes)

      const metricAttributes = {
        operation: 'cancel_all',
        'result.status': unknownValue(record.status),
        'dialog.cancel_parents': record.cancelParents,
      }

      DialogsMetrics.contextCount.add(1, metricAttributes)
      DialogsMetrics.contextDuration.record(duration, metricAttributes)
    }
  }),
}
