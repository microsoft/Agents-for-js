import { Activity } from '@microsoft/agents-activity'
import { trace, SpanNames } from '@microsoft/agents-telemetry'
import { CopilotStudioClientMetrics } from './metrics'
import { SubscribeEvent } from '../subscribeEvent'

export const CopilotStudioClientTraceDefinitions = {
  createConnection: trace.define({
    name: SpanNames.COPILOT_CREATE_CONNECTION,
    record: {
      showTyping: false,
    },
    end ({ span, record }) {
      const attributes = {
        'copilot.webchat.show_typing': record.showTyping ?? 'unknown'
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.webchatConnectionsCounter.add(1, attributes)
    }
  }),
  webchatStartConversation: trace.define({
    name: SpanNames.COPILOT_WEBCHAT_START_CONVERSATION,
    record: {
      activityCount: 0,
      conversationId: 'unknown',
    },
    end ({ span, record }) {
      span.setAttributes({
        'copilot.webchat.activity.received_count': record.activityCount,
        'copilot.webchat.conversation_id': record.conversationId ?? 'unknown'
      })
    }
  }),
  webchatPostActivity: trace.define({
    name: SpanNames.COPILOT_WEBCHAT_POST_ACTIVITY,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
      responseActivityCount: 0,
      conversationId: 'unknown',
    },
    actions: ({ span }) => ({
      sentToCopilot (activity: Activity, conversationId?: string) {
        span.addEvent('activity.sent', getWebChatActivityAttributes(activity, conversationId))
      }
    }),
    end ({ span, record }) {
      span.setAttributes({
        'copilot.webchat.activity.type': record.activity.type ?? 'unknown',
        'copilot.webchat.activity.id': record.activity.id ?? 'unknown',
        'copilot.webchat.activity.received_count': record.responseActivityCount,
        'copilot.webchat.conversation_id': record.conversationId ?? 'unknown'
      })
    }
  }),
  webchatReceiveActivity: trace.define({
    name: SpanNames.COPILOT_WEBCHAT_RECEIVE_ACTIVITY,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
      conversationId: 'unknown',
    },
    end ({ span, record }) {
      span.setAttributes({
        'copilot.webchat.activity.id': record.activity.id ?? 'unknown',
        'copilot.webchat.activity.type': record.activity.type ?? 'unknown',
        'copilot.webchat.activity.conversation_id': record.activity.conversation?.id ?? record.conversationId ?? 'unknown'
      })
    }
  }),
  endConnection: trace.define({
    name: SpanNames.COPILOT_WEBCHAT_END_CONNECTION,
    record: {
      conversationId: 'unknown',
    },
    end ({ span, record }) {
      span.setAttributes({
        'copilot.webchat.conversation_id': record.conversationId ?? 'unknown'
      })
    }
  }),
  postRequest: trace.define({
    name: SpanNames.COPILOT_POST_REQUEST,
    record: {
      url: '',
      method: ''
    },
    actions: ({ span }) => ({
      receivedFromCopilot (activity: Activity) {
        const attributes = {
          'copilot.activity.type': activity.type ?? 'unknown',
          'copilot.activity.conversation_id': activity.conversation?.id ?? 'unknown'
        }

        span.addEvent('activity.received', {
          'copilot.post_request.activity.type': attributes['copilot.activity.type'],
          'copilot.post_request.activity.conversation_id': attributes['copilot.activity.conversation_id']
        })
        CopilotStudioClientMetrics.activitiesReceivedCounter.add(1, attributes)
      }
    }),
    end ({ span, record, duration, error }) {
      const attributes = {
        'copilot.post_request.url': record.url ?? 'unknown',
        'copilot.post_request.method': record.method ?? 'unknown'
      }
      const metricAttributes = {
        operation: 'postRequestAsync',
        'copilot.post_request.url': attributes['copilot.post_request.url'],
        'copilot.post_request.method': attributes['copilot.post_request.method']
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.requestsCounter.add(1, metricAttributes)
      CopilotStudioClientMetrics.streamDuration.record(duration, metricAttributes)

      if (error) {
        CopilotStudioClientMetrics.requestsErrorCounter.add(1, {
          ...metricAttributes,
          'error.type': error instanceof Error ? error.name : typeof error,
        })
      }
    }
  }),
  startConversation: trace.define({
    name: SpanNames.COPILOT_START_CONVERSATION,
    record: {
      shouldEmitStartEvent: false,
    },
    end ({ span, record, duration }) {
      const attributes = record.shouldEmitStartEvent
        ? { 'copilot.emit_start_event': true }
        : { 'copilot.request': true }
      const metricAttributes = {
        operation: 'startConversationStreaming',
        ...attributes,
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.conversationsStartedCounter.add(1, metricAttributes)
      CopilotStudioClientMetrics.requestDuration.record(duration, metricAttributes)
    }
  }),
  sendActivity: trace.define({
    name: SpanNames.COPILOT_SEND_ACTIVITY,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
    },
    end ({ span, record, duration }) {
      const attributes = {
        'copilot.activity.type': record.activity.type ?? 'unknown',
        'copilot.activity.conversation_id': record.activity.conversation?.id ?? 'unknown'
      }
      const metricAttributes = {
        operation: 'sendActivityStreaming',
        ...attributes,
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.activitiesSentCounter.add(1, attributes)
      CopilotStudioClientMetrics.requestDuration.record(duration, metricAttributes)
    }
  }),
  executeStreaming: trace.define({
    name: SpanNames.COPILOT_EXECUTE_STREAMING,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
      conversationId: 'unknown'
    },
    end ({ span, record, duration }) {
      const attributes = {
        'copilot.activity.type': record.activity.type ?? 'unknown',
        'copilot.activity.conversation_id': record.conversationId ?? 'unknown'
      }
      const metricAttributes = {
        operation: 'executeStreaming',
        ...attributes,
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.executeStreamingCounter.add(1, attributes)
      CopilotStudioClientMetrics.requestDuration.record(duration, metricAttributes)
    }
  }),
  subscribeAsync: trace.define({
    name: SpanNames.COPILOT_SUBSCRIBE_ASYNC,
    record: {
      conversationId: 'unknown',
      lastReceivedEventId: 'unknown'
    },
    actions: ({ span }) => ({
      eventReceivedFromCopilot (event: SubscribeEvent) {
        const attributes = {
          'copilot.subscribe_async.event.id': event.eventId ?? 'unknown',
          'copilot.subscribe_async.event.activity.type': event.activity.type ?? 'unknown',
        }

        span.addEvent('event.received', attributes)
        CopilotStudioClientMetrics.subscribeEventCounter.add(1, attributes)
      }
    }),
    end ({ span, record, duration }) {
      const attributes = {
        'copilot.subscribe_async.conversation_id': record.conversationId ?? 'unknown',
        'copilot.subscribe_async.last_received_event_id': record.lastReceivedEventId ?? 'unknown'
      }
      const metricAttributes = {
        operation: 'subscribeAsync',
        'copilot.conversation_id': attributes['copilot.subscribe_async.conversation_id'],
        'copilot.last_received_event_id': attributes['copilot.subscribe_async.last_received_event_id']
      }

      span.setAttributes(attributes)
      CopilotStudioClientMetrics.subscribeAsyncCounter.add(1, metricAttributes)
      CopilotStudioClientMetrics.streamDuration.record(duration, metricAttributes)
    }
  })
}

function getWebChatActivityAttributes (activity: Activity, conversationId?: string) {
  return {
    'copilot.webchat.activity.id': activity.id ?? 'unknown',
    'copilot.webchat.activity.type': activity.type ?? 'unknown',
    'copilot.webchat.activity.conversation_id': activity.conversation?.id ?? conversationId ?? 'unknown'
  }
}
