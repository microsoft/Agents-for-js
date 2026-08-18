// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { TraceDefinition } from '@microsoft/agents-telemetry'
import * as sinon from 'sinon'
import { CosmosStorageMetrics } from '../../src/observability/metrics'
import { CosmosStorageTraceDefinitions } from '../../src/observability/traces'

const duration = 123

interface TestSpan {
  attributes: Record<string, unknown>
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

function createSpan (): TestSpan {
  const attributes: Record<string, unknown> = {}
  return {
    attributes,
    spanContext: () => ({ traceId: '', spanId: '', traceFlags: 0 }),
    setAttribute (name, value) { attributes[name] = value; return this },
    setAttributes (values) { Object.assign(attributes, values); return this },
    addEvent () { return this },
    addLink () { return this },
    addLinks () { return this },
    setStatus () { return this },
    updateName () { return this },
    end () {},
    isRecording: () => true,
    recordException () {},
  }
}

function endTrace<TRecord extends object, TActions extends object> (definition: TraceDefinition<TRecord, TActions>, record: TRecord): TestSpan {
  const span = createSpan()
  definition.end({ span, record, duration })
  return span
}

function endTraceWithIncompleteRecord<TRecord extends object, TActions extends object> (definition: TraceDefinition<TRecord, TActions>): TestSpan {
  const span = createSpan()
  definition.end({ span, record: { keyCount: undefined } as TRecord, duration })
  return span
}

describe('Cosmos storage trace definitions', () => {
  afterEach(() => sinon.restore())

  function assertStorageOperation<TActions extends object> (definition: TraceDefinition<{ keyCount: number }, TActions>, operation: string) {
    const operationDuration = sinon.stub()
    sinon.stub(CosmosStorageMetrics, 'storageOperationDuration').value({ record: operationDuration })
    const expectedAttributes = { 'storage.operation': operation, 'storage.key.count': 3 }

    const span = endTrace(definition, { keyCount: 3 })
    assert.deepEqual(span.attributes, expectedAttributes)
    sinon.assert.calledWithExactly(operationDuration, duration, expectedAttributes)

    const defaultSpan = endTrace(definition, definition.record)
    const zeroKeyCountAttributes = { 'storage.operation': operation, 'storage.key.count': 0 }
    assert.deepEqual(defaultSpan.attributes, zeroKeyCountAttributes)
    assert.deepEqual(operationDuration.getCall(1).args, [duration, zeroKeyCountAttributes])

    const missingSpan = endTraceWithIncompleteRecord(definition)
    assert.deepEqual(missingSpan.attributes, zeroKeyCountAttributes)
    assert.deepEqual(operationDuration.getCall(2).args, [duration, zeroKeyCountAttributes])
    sinon.assert.callCount(operationDuration, 3)
  }

  it('records read attributes, duration metric, defaults, and missing key counts', () => {
    assertStorageOperation(CosmosStorageTraceDefinitions.read, 'read')
  })

  it('records write attributes, duration metric, defaults, and missing key counts', () => {
    assertStorageOperation(CosmosStorageTraceDefinitions.write, 'write')
  })

  it('records delete attributes, duration metric, defaults, and missing key counts', () => {
    assertStorageOperation(CosmosStorageTraceDefinitions.delete, 'delete')
  })
})
