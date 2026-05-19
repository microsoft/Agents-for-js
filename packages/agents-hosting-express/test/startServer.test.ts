import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as sinon from 'sinon'
import express from 'express'
import { ActivityHandler, AgentApplication, CloudAdapter } from '@microsoft/agents-hosting'
import { startServer } from '../src/startServer'

class TestActivityHandler extends ActivityHandler {}

describe('startServer', () => {
  let listenStub: sinon.SinonStub
  let consoleLogStub: sinon.SinonStub

  beforeEach(() => {
    listenStub = sinon.stub(express.application, 'listen').callsFake(function (_port: any, callback?: () => void) {
      callback?.()
      return {
        on: sinon.stub().returnsThis()
      } as any
    })
    consoleLogStub = sinon.stub(console, 'log')
  })

  afterEach(() => {
    listenStub.restore()
    consoleLogStub.restore()
  })

  it('configures the created adapter for ActivityHandler instances', () => {
    const handler = new TestActivityHandler()
    let configuredAdapter: CloudAdapter | undefined

    startServer(handler, {
      authConfiguration: {},
      configureAdapter: (adapter) => {
        configuredAdapter = adapter
      }
    })

    assert.ok(configuredAdapter instanceof CloudAdapter)
    assert.strictEqual(listenStub.calledOnce, true)
  })

  it('configures the existing application adapter when provided', () => {
    const adapter = new CloudAdapter()
    const app = new AgentApplication({ adapter })
    let configuredAdapter: CloudAdapter | undefined

    startServer(app, {
      configureAdapter: (value) => {
        configuredAdapter = value
      }
    })

    assert.strictEqual(configuredAdapter, adapter)
    assert.strictEqual(listenStub.calledOnce, true)
  })

  it('accepts the legacy auth configuration argument', () => {
    const handler = new TestActivityHandler()

    startServer(handler, {})

    assert.strictEqual(listenStub.calledOnce, true)
  })
})
