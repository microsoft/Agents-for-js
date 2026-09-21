// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import type { TraceDefinition } from '@microsoft/agents-telemetry'
import * as sinon from 'sinon'
import { DialogsMetrics } from '../../src/observability/metrics'
import { DialogsTraceDefinitions } from '../../src/observability/traces'

const duration = 123

type TraceSpan = Parameters<TraceDefinition<object, object>['end']>[0]['span']

type TestSpan = TraceSpan & {
  attributes: Record<string, unknown>
}

function createSpan (): TestSpan {
  const attributes: Record<string, unknown> = {}

  return {
    attributes,
    spanContext () {
      return {
        traceId: '',
        spanId: '',
        traceFlags: 0,
      }
    },
    setAttribute (name, value) {
      attributes[name] = value
      return this
    },
    setAttributes (values) {
      Object.assign(attributes, values)
      return this
    },
    addEvent () {
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
  } satisfies TestSpan
}

function endTrace<TRecord extends object, TActions extends object> (
  definition: TraceDefinition<TRecord, TActions>,
  record: TRecord
): TestSpan {
  const span = createSpan()
  definition.end({ span, record, duration })
  return span
}

function stubContextMetrics () {
  const contextCount = sinon.stub()
  const contextDuration = sinon.stub()
  sinon.stub(DialogsMetrics, 'contextCount').value({ add: contextCount })
  sinon.stub(DialogsMetrics, 'contextDuration').value({ record: contextDuration })
  return { contextCount, contextDuration }
}

function assertContextMetrics (
  contextCount: sinon.SinonStub,
  contextDuration: sinon.SinonStub,
  attributes: Record<string, unknown>
) {
  sinon.assert.calledOnceWithExactly(contextCount, 1, attributes)
  sinon.assert.calledOnceWithExactly(contextDuration, duration, attributes)
}

describe('dialog trace definitions', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('should set run attributes when a dialog run ends', () => {
    const span = endTrace(DialogsTraceDefinitions.run, {
      dialogId: 'root-dialog',
      activity: Activity.fromObject({
        type: 'message',
        channelId: 'msteams',
        conversation: { id: 'conversation-id' },
      }),
      status: 'complete',
      attemptCount: 2,
    })

    assert.deepEqual(span.attributes, {
      'dialog.root_id': 'root-dialog',
      'activity.type': 'message',
      'activity.channel_id': 'msteams',
      'activity.conversation_id': 'conversation-id',
      'dialog.status': 'complete',
      'dialog.attempt_count': 2,
    })
  })

  it('should set default run attributes when a dialog run ends with defaults', () => {
    const span = endTrace(DialogsTraceDefinitions.run, DialogsTraceDefinitions.run.record)

    assert.deepEqual(span.attributes, {
      'dialog.root_id': 'unknown',
      'activity.type': 'unknown',
      'activity.channel_id': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.status': 'unknown',
      'dialog.attempt_count': 0,
    })
  })

  it('should set begin attributes and metrics when a dialog context begins', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(DialogsTraceDefinitions.contextBegin, {
      dialogId: 'dialog-id',
      name: 'dialog-name',
      parentId: 'parent-id',
      status: 'waiting',
      activity: Activity.fromObject({
        type: 'message',
        conversation: { id: 'conversation-id' },
      }),
    })
    const metricAttributes = {
      operation: 'begin',
      'result.status': 'waiting',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'message',
      'activity.conversation_id': 'conversation-id',
      'dialog.id': 'dialog-id',
      'dialog.name': 'dialog-name',
      'dialog.parent_id': 'parent-id',
      'dialog.status': 'waiting',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set default begin attributes and metrics when a dialog context begins with defaults', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(
      DialogsTraceDefinitions.contextBegin,
      DialogsTraceDefinitions.contextBegin.record
    )
    const metricAttributes = {
      operation: 'begin',
      'result.status': 'unknown',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.id': 'unknown',
      'dialog.name': 'unknown',
      'dialog.parent_id': 'unknown',
      'dialog.status': 'unknown',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set continue attributes and metrics when a dialog context continues', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(DialogsTraceDefinitions.contextContinue, {
      dialogId: 'dialog-id',
      name: 'dialog-name',
      status: 'waiting',
      activity: Activity.fromObject({
        type: 'message',
        conversation: { id: 'conversation-id' },
      }),
    })
    const metricAttributes = {
      operation: 'continue',
      'result.status': 'waiting',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'message',
      'activity.conversation_id': 'conversation-id',
      'dialog.id': 'dialog-id',
      'dialog.name': 'dialog-name',
      'dialog.status': 'waiting',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set default continue attributes and metrics when a dialog context continues with defaults', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(
      DialogsTraceDefinitions.contextContinue,
      DialogsTraceDefinitions.contextContinue.record
    )
    const metricAttributes = {
      operation: 'continue',
      'result.status': 'unknown',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.id': 'unknown',
      'dialog.name': 'unknown',
      'dialog.status': 'unknown',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set end attributes and metrics when a dialog context ends', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(DialogsTraceDefinitions.contextEnd, {
      activity: Activity.fromObject({
        type: 'message',
        conversation: { id: 'conversation-id' },
      }),
      dialogId: 'dialog-id',
      name: 'dialog-name',
      status: 'complete',
    })
    const metricAttributes = {
      operation: 'end',
      'result.status': 'complete',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'message',
      'activity.conversation_id': 'conversation-id',
      'dialog.id': 'dialog-id',
      'dialog.name': 'dialog-name',
      'dialog.status': 'complete',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set default end attributes and metrics when a dialog context ends with defaults', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(
      DialogsTraceDefinitions.contextEnd,
      DialogsTraceDefinitions.contextEnd.record
    )
    const metricAttributes = {
      operation: 'end',
      'result.status': 'unknown',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.id': 'unknown',
      'dialog.name': 'unknown',
      'dialog.status': 'unknown',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set replacement attributes and metrics when a dialog context is replaced', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(DialogsTraceDefinitions.contextReplace, {
      activity: Activity.fromObject({
        type: 'message',
        conversation: { id: 'conversation-id' },
      }),
      dialogId: 'dialog-id',
      name: 'dialog-name',
      replacementDialogId: 'replacement-dialog-id',
      replacementName: 'replacement-dialog-name',
      status: 'complete',
    })
    const metricAttributes = {
      operation: 'replace',
      'result.status': 'complete',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'message',
      'activity.conversation_id': 'conversation-id',
      'dialog.id': 'dialog-id',
      'dialog.name': 'dialog-name',
      'dialog.replacement_id': 'replacement-dialog-id',
      'dialog.replacement_name': 'replacement-dialog-name',
      'dialog.status': 'complete',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set default replacement attributes and metrics when a dialog context is replaced with defaults', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(
      DialogsTraceDefinitions.contextReplace,
      DialogsTraceDefinitions.contextReplace.record
    )
    const metricAttributes = {
      operation: 'replace',
      'result.status': 'unknown',
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.id': 'unknown',
      'dialog.name': 'unknown',
      'dialog.replacement_id': 'unknown',
      'dialog.replacement_name': 'unknown',
      'dialog.status': 'unknown',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set cancellation attributes and metrics when all dialog contexts are cancelled', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(DialogsTraceDefinitions.contextCancelAll, {
      activity: Activity.fromObject({
        type: 'event',
        conversation: { id: 'conversation-id' },
      }),
      cancelParents: true,
      dialogId: 'dialog-id',
      eventName: 'cancel-event',
      name: 'dialog-name',
      status: 'cancelled',
    })
    const metricAttributes = {
      operation: 'cancel_all',
      'result.status': 'cancelled',
      'dialog.cancel_parents': true,
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'event',
      'activity.conversation_id': 'conversation-id',
      'dialog.cancel_parents': true,
      'dialog.event_name': 'cancel-event',
      'dialog.id': 'dialog-id',
      'dialog.name': 'dialog-name',
      'dialog.status': 'cancelled',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })

  it('should set default cancellation attributes and metrics when all dialog contexts are cancelled with defaults', () => {
    const { contextCount, contextDuration } = stubContextMetrics()
    const span = endTrace(
      DialogsTraceDefinitions.contextCancelAll,
      DialogsTraceDefinitions.contextCancelAll.record
    )
    const metricAttributes = {
      operation: 'cancel_all',
      'result.status': 'unknown',
      'dialog.cancel_parents': false,
    }

    assert.deepEqual(span.attributes, {
      'activity.type': 'unknown',
      'activity.conversation_id': 'unknown',
      'dialog.cancel_parents': false,
      'dialog.event_name': 'unknown',
      'dialog.id': 'unknown',
      'dialog.name': 'unknown',
      'dialog.status': 'unknown',
    })
    assertContextMetrics(contextCount, contextDuration, metricAttributes)
  })
})
