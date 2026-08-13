// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import type { TraceDefinition } from '@microsoft/agents-telemetry'
import { Activity } from '@microsoft/agents-activity'
import * as sinon from 'sinon'
import { CopilotStudioClientMetrics } from '../../src/observability/metrics'
import { CopilotStudioClientTraceDefinitions } from '../../src/observability/traces'
import type { SubscribeEvent } from '../../src/subscribeEvent'

const duration = 123

interface TestSpan {
  attributes: Record<string, unknown>
  events: Array<{ name: string, attributes: Record<string, unknown> }>
  spanContext(): { traceId: string, spanId: string, traceFlags: number }
  setAttribute(name: string, value: unknown): this
  setAttributes(values: Record<string, unknown>): this
  addEvent(name: string, attributes?: unknown, startTime?: unknown): this
  addLink(link: unknown): this
  addLinks(links: unknown[]): this
  setStatus(status: unknown): this
  updateName(name: string): this
  end(endTime?: unknown): void
  isRecording(): boolean
  recordException(exception: unknown, time?: unknown): void
}

interface PostRequestActions {
  receivedFromCopilot(activity: Activity): void
}

interface SubscribeAsyncActions {
  eventReceivedFromCopilot(event: SubscribeEvent): void
}

function createSpan (): TestSpan {
  const attributes: Record<string, unknown> = {}
  const events: Array<{ name: string, attributes: Record<string, unknown> }> = []

  return {
    attributes,
    events,
    spanContext () {
      return { traceId: '', spanId: '', traceFlags: 0 }
    },
    setAttribute (name, value) {
      attributes[name] = value
      return this
    },
    setAttributes (values) {
      Object.assign(attributes, values)
      return this
    },
    addEvent (name, values) {
      events.push({ name, attributes: (values ?? {}) as Record<string, unknown> })
      return this
    },
    addLink () {
      return this
    },
    addLinks () {
      return this
    },
    setStatus () {
      return this
    },
    updateName () {
      return this
    },
    end () {},
    isRecording () {
      return true
    },
    recordException () {},
  }
}

function endTrace<TRecord extends object, TActions extends object> (
  definition: TraceDefinition<TRecord, TActions>,
  record: TRecord,
  error?: unknown
): TestSpan {
  const span = createSpan()
  definition.end({ span: span as unknown as Span, record, duration, error })
  return span
}

function endTraceWithIncompleteRecord<TRecord extends object, TActions extends object> (
  definition: TraceDefinition<TRecord, TActions>,
  record: Record<string, unknown>
): TestSpan {
  const span = createSpan()
  definition.end({ span: span as unknown as Span, record: record as TRecord, duration })
  return span
}

function assertMetric (metric: sinon.SinonStub, value: number, attributes: Record<string, unknown>) {
  sinon.assert.calledOnceWithExactly(metric, value, attributes)
}

describe('Copilot Studio client trace definitions', () => {
  afterEach(() => sinon.restore())

  it('records web chat connection attributes and metrics', () => {
    const connections = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'webchatConnectionsCounter').value({ add: connections })
    const endedSpan = endTrace(CopilotStudioClientTraceDefinitions.createConnection, { showTyping: true })

    assert.deepEqual(endedSpan.attributes, { 'copilot.webchat.show_typing': true })
    assertMetric(connections, 1, { 'copilot.webchat.show_typing': true })
  })

  it('records post request attributes, received activities, metrics, and errors', () => {
    const received = sinon.stub()
    const requests = sinon.stub()
    const requestErrors = sinon.stub()
    const streamDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'activitiesReceivedCounter').value({ add: received })
    sinon.stub(CopilotStudioClientMetrics, 'requestsCounter').value({ add: requests })
    sinon.stub(CopilotStudioClientMetrics, 'requestsErrorCounter').value({ add: requestErrors })
    sinon.stub(CopilotStudioClientMetrics, 'streamDuration').value({ record: streamDuration })
    const span = createSpan()
    const actions = CopilotStudioClientTraceDefinitions.postRequest.actions!({ span: span as unknown as Span }) as PostRequestActions
    actions.receivedFromCopilot(Activity.fromObject({ type: 'message', conversation: { id: 'conversation-id' } }))

    const endedSpan = endTrace(CopilotStudioClientTraceDefinitions.postRequest, {
      url: 'https://copilot.example.com', method: 'POST'
    }, new TypeError('request failed'))
    const metricAttributes = {
      operation: 'postRequestAsync',
      'copilot.post_request.url': 'https://copilot.example.com',
      'copilot.post_request.method': 'POST',
    }

    assert.deepEqual(span.events, [{ name: 'activity.received', attributes: { 'copilot.post_request.activity.type': 'message', 'copilot.post_request.activity.conversation_id': 'conversation-id' } }])
    assertMetric(received, 1, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'conversation-id' })
    assert.deepEqual(endedSpan.attributes, { 'copilot.post_request.url': 'https://copilot.example.com', 'copilot.post_request.method': 'POST' })
    assertMetric(requests, 1, metricAttributes)
    assertMetric(streamDuration, duration, metricAttributes)
    assertMetric(requestErrors, 1, { ...metricAttributes, 'error.type': 'TypeError' })
  })

  it('does not record request errors on success and classifies non-Error failures', () => {
    const requests = sinon.stub()
    const requestErrors = sinon.stub()
    const streamDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'requestsCounter').value({ add: requests })
    sinon.stub(CopilotStudioClientMetrics, 'requestsErrorCounter').value({ add: requestErrors })
    sinon.stub(CopilotStudioClientMetrics, 'streamDuration').value({ record: streamDuration })
    const successAttributes = { operation: 'postRequestAsync', 'copilot.post_request.url': 'https://copilot.example.com', 'copilot.post_request.method': 'GET' }

    endTrace(CopilotStudioClientTraceDefinitions.postRequest, { url: 'https://copilot.example.com', method: 'GET' })
    sinon.assert.notCalled(requestErrors)

    endTrace(CopilotStudioClientTraceDefinitions.postRequest, { url: 'https://copilot.example.com', method: 'GET' }, 'request failed')
    sinon.assert.calledTwice(requests)
    sinon.assert.calledTwice(streamDuration)
    assertMetric(requestErrors, 1, { ...successAttributes, 'error.type': 'string' })
  })

  it('records start conversation attributes and metrics for both request modes', () => {
    const started = sinon.stub()
    const requestDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'conversationsStartedCounter').value({ add: started })
    sinon.stub(CopilotStudioClientMetrics, 'requestDuration').value({ record: requestDuration })

    const emitStartSpan = endTrace(CopilotStudioClientTraceDefinitions.startConversation, { shouldEmitStartEvent: true })
    const requestSpan = endTrace(CopilotStudioClientTraceDefinitions.startConversation, { shouldEmitStartEvent: false })

    assert.deepEqual(emitStartSpan.attributes, { 'copilot.emit_start_event': true })
    assert.deepEqual(requestSpan.attributes, { 'copilot.request': true })
    sinon.assert.calledWithExactly(started, 1, { operation: 'startConversationStreaming', 'copilot.emit_start_event': true })
    sinon.assert.calledWithExactly(started, 1, { operation: 'startConversationStreaming', 'copilot.request': true })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'startConversationStreaming', 'copilot.emit_start_event': true })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'startConversationStreaming', 'copilot.request': true })
  })

  it('records send activity attributes and metrics', () => {
    const sent = sinon.stub()
    const requestDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'activitiesSentCounter').value({ add: sent })
    sinon.stub(CopilotStudioClientMetrics, 'requestDuration').value({ record: requestDuration })
    const span = endTrace(CopilotStudioClientTraceDefinitions.sendActivity, {
      activity: Activity.fromObject({ type: 'message', conversation: { id: 'conversation-id' } })
    })
    const attributes = { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'conversation-id' }
    const metricAttributes = { operation: 'sendActivityStreaming', ...attributes }

    assert.deepEqual(span.attributes, attributes)
    assertMetric(sent, 1, attributes)
    assertMetric(requestDuration, duration, metricAttributes)
  })

  it('records execute streaming attributes and metrics', () => {
    const executed = sinon.stub()
    const requestDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'executeStreamingCounter').value({ add: executed })
    sinon.stub(CopilotStudioClientMetrics, 'requestDuration').value({ record: requestDuration })
    const span = endTrace(CopilotStudioClientTraceDefinitions.executeStreaming, {
      activity: Activity.fromObject({ type: 'event' }), conversationId: 'conversation-id'
    })
    const attributes = { 'copilot.activity.type': 'event', 'copilot.activity.conversation_id': 'conversation-id' }

    assert.deepEqual(span.attributes, attributes)
    assertMetric(executed, 1, attributes)
    assertMetric(requestDuration, duration, { operation: 'executeStreaming', ...attributes })
  })

  it('records subscription attributes, received events, and metrics', () => {
    const events = sinon.stub()
    const subscriptions = sinon.stub()
    const streamDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'subscribeEventCounter').value({ add: events })
    sinon.stub(CopilotStudioClientMetrics, 'subscribeAsyncCounter').value({ add: subscriptions })
    sinon.stub(CopilotStudioClientMetrics, 'streamDuration').value({ record: streamDuration })
    const span = createSpan()
    const actions = CopilotStudioClientTraceDefinitions.subscribeAsync.actions!({ span: span as unknown as Span }) as SubscribeAsyncActions
    const event: SubscribeEvent = { eventId: 'event-id', activity: Activity.fromObject({ type: 'message' }) }
    actions.eventReceivedFromCopilot(event)

    const endedSpan = endTrace(CopilotStudioClientTraceDefinitions.subscribeAsync, {
      conversationId: 'conversation-id', lastReceivedEventId: 'previous-event-id'
    })
    const spanAttributes = {
      'copilot.subscribe_async.conversation_id': 'conversation-id',
      'copilot.subscribe_async.last_received_event_id': 'previous-event-id',
    }
    const metricAttributes = {
      operation: 'subscribeAsync',
      'copilot.conversation_id': 'conversation-id',
      'copilot.last_received_event_id': 'previous-event-id',
    }

    assert.deepEqual(span.events, [{ name: 'event.received', attributes: { 'copilot.subscribe_async.event.id': 'event-id', 'copilot.subscribe_async.event.activity.type': 'message' } }])
    assertMetric(events, 1, { 'copilot.subscribe_async.event.id': 'event-id', 'copilot.subscribe_async.event.activity.type': 'message' })
    assert.deepEqual(endedSpan.attributes, spanAttributes)
    assertMetric(subscriptions, 1, metricAttributes)
    assertMetric(streamDuration, duration, metricAttributes)
  })

  it('uses unknown for missing optional trace values', () => {
    const connections = sinon.stub()
    const received = sinon.stub()
    const sent = sinon.stub()
    const executed = sinon.stub()
    const events = sinon.stub()
    const subscriptions = sinon.stub()
    const requests = sinon.stub()
    const streamDuration = sinon.stub()
    const requestDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'webchatConnectionsCounter').value({ add: connections })
    sinon.stub(CopilotStudioClientMetrics, 'activitiesReceivedCounter').value({ add: received })
    sinon.stub(CopilotStudioClientMetrics, 'activitiesSentCounter').value({ add: sent })
    sinon.stub(CopilotStudioClientMetrics, 'executeStreamingCounter').value({ add: executed })
    sinon.stub(CopilotStudioClientMetrics, 'subscribeEventCounter').value({ add: events })
    sinon.stub(CopilotStudioClientMetrics, 'subscribeAsyncCounter').value({ add: subscriptions })
    sinon.stub(CopilotStudioClientMetrics, 'requestsCounter').value({ add: requests })
    sinon.stub(CopilotStudioClientMetrics, 'streamDuration').value({ record: streamDuration })
    sinon.stub(CopilotStudioClientMetrics, 'requestDuration').value({ record: requestDuration })
    const activity = Activity.fromObject({ type: 'message' })

    const requestSpan = createSpan()
    ;(CopilotStudioClientTraceDefinitions.postRequest.actions!({ span: requestSpan as unknown as Span }) as PostRequestActions).receivedFromCopilot(activity)
    const subscriptionSpan = createSpan()
    ;(CopilotStudioClientTraceDefinitions.subscribeAsync.actions!({ span: subscriptionSpan as unknown as Span }) as SubscribeAsyncActions).eventReceivedFromCopilot({ activity })

    assert.deepEqual(requestSpan.events[0].attributes, { 'copilot.post_request.activity.type': 'message', 'copilot.post_request.activity.conversation_id': 'unknown' })
    assert.deepEqual(subscriptionSpan.events[0].attributes, { 'copilot.subscribe_async.event.id': 'unknown', 'copilot.subscribe_async.event.activity.type': 'message' })
    assertMetric(received, 1, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    assertMetric(events, 1, { 'copilot.subscribe_async.event.id': 'unknown', 'copilot.subscribe_async.event.activity.type': 'message' })

    const connection = endTraceWithIncompleteRecord(CopilotStudioClientTraceDefinitions.createConnection, { showTyping: undefined })
    const request = endTraceWithIncompleteRecord(CopilotStudioClientTraceDefinitions.postRequest, { url: undefined, method: undefined })
    const sentActivity = endTrace(CopilotStudioClientTraceDefinitions.sendActivity, { activity })
    const execution = endTraceWithIncompleteRecord(CopilotStudioClientTraceDefinitions.executeStreaming, { activity, conversationId: undefined })
    const subscription = endTraceWithIncompleteRecord(CopilotStudioClientTraceDefinitions.subscribeAsync, { conversationId: undefined, lastReceivedEventId: undefined })

    assert.deepEqual(connection.attributes, { 'copilot.webchat.show_typing': 'unknown' })
    assert.deepEqual(request.attributes, { 'copilot.post_request.url': 'unknown', 'copilot.post_request.method': 'unknown' })
    assert.deepEqual(sentActivity.attributes, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    assert.deepEqual(execution.attributes, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    assert.deepEqual(subscription.attributes, { 'copilot.subscribe_async.conversation_id': 'unknown', 'copilot.subscribe_async.last_received_event_id': 'unknown' })
    assertMetric(connections, 1, { 'copilot.webchat.show_typing': 'unknown' })
    assertMetric(requests, 1, { operation: 'postRequestAsync', 'copilot.post_request.url': 'unknown', 'copilot.post_request.method': 'unknown' })
    assertMetric(sent, 1, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    assertMetric(executed, 1, { 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    assertMetric(subscriptions, 1, { operation: 'subscribeAsync', 'copilot.conversation_id': 'unknown', 'copilot.last_received_event_id': 'unknown' })
    sinon.assert.calledWithExactly(streamDuration, duration, { operation: 'postRequestAsync', 'copilot.post_request.url': 'unknown', 'copilot.post_request.method': 'unknown' })
    sinon.assert.calledWithExactly(streamDuration, duration, { operation: 'subscribeAsync', 'copilot.conversation_id': 'unknown', 'copilot.last_received_event_id': 'unknown' })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'sendActivityStreaming', 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'executeStreaming', 'copilot.activity.type': 'message', 'copilot.activity.conversation_id': 'unknown' })
  })

  it('preserves trace defaults and uses unknown for missing activity values', () => {
    const connections = sinon.stub()
    const requests = sinon.stub()
    const sent = sinon.stub()
    const executed = sinon.stub()
    const subscriptions = sinon.stub()
    const streamDuration = sinon.stub()
    const requestDuration = sinon.stub()
    sinon.stub(CopilotStudioClientMetrics, 'webchatConnectionsCounter').value({ add: connections })
    sinon.stub(CopilotStudioClientMetrics, 'requestsCounter').value({ add: requests })
    sinon.stub(CopilotStudioClientMetrics, 'activitiesSentCounter').value({ add: sent })
    sinon.stub(CopilotStudioClientMetrics, 'executeStreamingCounter').value({ add: executed })
    sinon.stub(CopilotStudioClientMetrics, 'subscribeAsyncCounter').value({ add: subscriptions })
    sinon.stub(CopilotStudioClientMetrics, 'streamDuration').value({ record: streamDuration })
    sinon.stub(CopilotStudioClientMetrics, 'requestDuration').value({ record: requestDuration })

    const connection = endTrace(CopilotStudioClientTraceDefinitions.createConnection, CopilotStudioClientTraceDefinitions.createConnection.record)
    const request = endTrace(CopilotStudioClientTraceDefinitions.postRequest, CopilotStudioClientTraceDefinitions.postRequest.record)
    const activity = endTrace(CopilotStudioClientTraceDefinitions.sendActivity, CopilotStudioClientTraceDefinitions.sendActivity.record)
    const execution = endTrace(CopilotStudioClientTraceDefinitions.executeStreaming, CopilotStudioClientTraceDefinitions.executeStreaming.record)
    const subscription = endTrace(CopilotStudioClientTraceDefinitions.subscribeAsync, CopilotStudioClientTraceDefinitions.subscribeAsync.record)
    assert.deepEqual(connection.attributes, { 'copilot.webchat.show_typing': false })
    assert.deepEqual(request.attributes, { 'copilot.post_request.url': '', 'copilot.post_request.method': '' })
    assert.deepEqual(activity.attributes, { 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
    assert.deepEqual(execution.attributes, { 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
    assert.deepEqual(subscription.attributes, { 'copilot.subscribe_async.conversation_id': 'unknown', 'copilot.subscribe_async.last_received_event_id': 'unknown' })
    assertMetric(connections, 1, { 'copilot.webchat.show_typing': false })
    assertMetric(requests, 1, { operation: 'postRequestAsync', 'copilot.post_request.url': '', 'copilot.post_request.method': '' })
    assertMetric(sent, 1, { 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
    assertMetric(executed, 1, { 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
    assertMetric(subscriptions, 1, { operation: 'subscribeAsync', 'copilot.conversation_id': 'unknown', 'copilot.last_received_event_id': 'unknown' })
    sinon.assert.calledWithExactly(streamDuration, duration, { operation: 'postRequestAsync', 'copilot.post_request.url': '', 'copilot.post_request.method': '' })
    sinon.assert.calledWithExactly(streamDuration, duration, { operation: 'subscribeAsync', 'copilot.conversation_id': 'unknown', 'copilot.last_received_event_id': 'unknown' })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'sendActivityStreaming', 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
    sinon.assert.calledWithExactly(requestDuration, duration, { operation: 'executeStreaming', 'copilot.activity.type': 'unknown', 'copilot.activity.conversation_id': 'unknown' })
  })
})
