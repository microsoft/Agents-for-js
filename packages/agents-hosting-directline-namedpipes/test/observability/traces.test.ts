// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import type { TraceDefinition } from '@microsoft/agents-telemetry'
import * as sinon from 'sinon'
import { NamedPipeMetrics } from '../../src/observability/metrics.js'
import { NamedPipeTraceDefinitions } from '../../src/observability/traces.js'

const duration = 123

type TraceSpan = Parameters<TraceDefinition<object, object>['end']>[0]['span']

interface TestSpan {
  attributes: Record<string, unknown>
  setAttribute(name: string, value: unknown): void
  setAttributes(values: Record<string, unknown>): void
}

function createSpan (): TestSpan {
  const attributes: Record<string, unknown> = {}

  return {
    attributes,
    setAttribute (name, value) {
      attributes[name] = value
    },
    setAttributes (values) {
      Object.assign(attributes, values)
    },
  }
}

function endTrace<TRecord extends object, TActions extends object> (
  definition: TraceDefinition<TRecord, TActions>,
  record: TRecord,
  error?: unknown
): TestSpan {
  const span = createSpan()
  definition.end({ span: span as unknown as TraceSpan, record, duration, error })
  return span
}

function stubDispatchMetrics () {
  const dispatches = sinon.stub()
  const dispatchErrors = sinon.stub()
  const dispatchDuration = sinon.stub()
  sinon.stub(NamedPipeMetrics, 'dispatchesCounter').value({ add: dispatches })
  sinon.stub(NamedPipeMetrics, 'dispatchErrorsCounter').value({ add: dispatchErrors })
  sinon.stub(NamedPipeMetrics, 'dispatchDuration').value({ record: dispatchDuration })
  return { dispatches, dispatchErrors, dispatchDuration }
}

function assertDispatchMetrics (
  dispatches: sinon.SinonStub,
  dispatchDuration: sinon.SinonStub,
  attributes: Record<string, unknown>
) {
  sinon.assert.calledOnceWithExactly(dispatches, 1, attributes)
  sinon.assert.calledOnceWithExactly(dispatchDuration, duration, attributes)
}

describe('named pipe trace definitions', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('should set the pipe name and connection metric when a connection ends', () => {
    const connections = sinon.stub()
    sinon.stub(NamedPipeMetrics, 'connectionsCounter').value({ add: connections })

    const span = endTrace(NamedPipeTraceDefinitions.connect, {
      pipeName: 'agents-pipe',
    })

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.pipe_name': 'agents-pipe',
    })
    sinon.assert.calledOnceWithExactly(connections, 1)
  })

  it('should set the default pipe name and connection metric when a connection ends with defaults', () => {
    const connections = sinon.stub()
    sinon.stub(NamedPipeMetrics, 'connectionsCounter').value({ add: connections })

    const span = endTrace(
      NamedPipeTraceDefinitions.connect,
      NamedPipeTraceDefinitions.connect.record
    )

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.pipe_name': '',
    })
    sinon.assert.calledOnceWithExactly(connections, 1)
  })

  it('should set request attributes and metrics when a dispatch succeeds', () => {
    const { dispatches, dispatchErrors, dispatchDuration } = stubDispatchMetrics()
    const span = endTrace(NamedPipeTraceDefinitions.dispatch, {
      verb: 'POST',
      path: '/api/messages',
      statusCode: 202,
    })
    const metricAttributes = {
      'request.verb': 'POST',
      'request.path': '/api/messages',
    }

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.request.verb': 'POST',
      'agents.named_pipe.request.path': '/api/messages',
      'agents.named_pipe.response.status_code': 202,
    })
    assertDispatchMetrics(dispatches, dispatchDuration, metricAttributes)
    sinon.assert.notCalled(dispatchErrors)
  })

  it('should set default request attributes and metrics when a dispatch succeeds with defaults', () => {
    const { dispatches, dispatchErrors, dispatchDuration } = stubDispatchMetrics()
    const span = endTrace(
      NamedPipeTraceDefinitions.dispatch,
      NamedPipeTraceDefinitions.dispatch.record
    )
    const metricAttributes = {
      'request.verb': '',
      'request.path': '',
    }

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.request.verb': '',
      'agents.named_pipe.request.path': '',
      'agents.named_pipe.response.status_code': 0,
    })
    assertDispatchMetrics(dispatches, dispatchDuration, metricAttributes)
    sinon.assert.notCalled(dispatchErrors)
  })

  it('should set the error type and request metrics when a dispatch ends with an Error', () => {
    const { dispatches, dispatchErrors, dispatchDuration } = stubDispatchMetrics()
    const span = endTrace(NamedPipeTraceDefinitions.dispatch, {
      verb: 'POST',
      path: '/api/messages',
      statusCode: 500,
    }, new TypeError('dispatch failed'))
    const metricAttributes = {
      'request.verb': 'POST',
      'request.path': '/api/messages',
    }

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.request.verb': 'POST',
      'agents.named_pipe.request.path': '/api/messages',
      'agents.named_pipe.response.status_code': 500,
    })
    assertDispatchMetrics(dispatches, dispatchDuration, metricAttributes)
    sinon.assert.calledOnceWithExactly(dispatchErrors, 1, {
      'error.type': 'TypeError',
    })
  })

  it('should set the primitive error type and request metrics when a dispatch ends with a primitive error', () => {
    const { dispatches, dispatchErrors, dispatchDuration } = stubDispatchMetrics()
    const span = endTrace(NamedPipeTraceDefinitions.dispatch, {
      verb: 'GET',
      path: '/api/messages',
      statusCode: 500,
    }, 'dispatch failed')
    const metricAttributes = {
      'request.verb': 'GET',
      'request.path': '/api/messages',
    }

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.request.verb': 'GET',
      'agents.named_pipe.request.path': '/api/messages',
      'agents.named_pipe.response.status_code': 500,
    })
    assertDispatchMetrics(dispatches, dispatchDuration, metricAttributes)
    sinon.assert.calledOnceWithExactly(dispatchErrors, 1, {
      'error.type': 'string',
    })
  })

  it('should set response attributes and metrics when a response send ends', () => {
    const sends = sinon.stub()
    const sendDuration = sinon.stub()
    sinon.stub(NamedPipeMetrics, 'sendsCounter').value({ add: sends })
    sinon.stub(NamedPipeMetrics, 'sendDuration').value({ record: sendDuration })

    const span = endTrace(NamedPipeTraceDefinitions.send, {
      statusCode: 202,
      bodySize: 512,
    })

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.response.status_code': 202,
      'agents.named_pipe.response.body_size': 512,
    })
    sinon.assert.calledOnceWithExactly(sends, 1)
    sinon.assert.calledOnceWithExactly(sendDuration, duration)
  })

  it('should set default response attributes and metrics when a response send ends with defaults', () => {
    const sends = sinon.stub()
    const sendDuration = sinon.stub()
    sinon.stub(NamedPipeMetrics, 'sendsCounter').value({ add: sends })
    sinon.stub(NamedPipeMetrics, 'sendDuration').value({ record: sendDuration })

    const span = endTrace(
      NamedPipeTraceDefinitions.send,
      NamedPipeTraceDefinitions.send.record
    )

    assert.deepStrictEqual(span.attributes, {
      'agents.named_pipe.response.status_code': 0,
      'agents.named_pipe.response.body_size': 0,
    })
    sinon.assert.calledOnceWithExactly(sends, 1)
    sinon.assert.calledOnceWithExactly(sendDuration, duration)
  })
})
