/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ActivityHandler, AgentApplication, CloudAdapter, type OutboundUrlPolicy } from '@microsoft/agents-hosting'
import { createCloudAdapter } from '../src/index'
import {
  createScopedAdapterConfigurationContext,
  createScopedConfigurationContext
} from './configurationContext.fixture'

describe('createCloudAdapter', () => {
  it('should create a new CloudAdapter for an ActivityHandler', () => {
    const handler = new ActivityHandler()
    const result = createCloudAdapter(handler)

    assert.ok(result.adapter instanceof CloudAdapter)
    assert.strictEqual(result.headerPropagation, undefined)
  })

  it('should use provided authConfig when creating a new CloudAdapter', () => {
    const handler = new ActivityHandler()
    const result = createCloudAdapter(handler, { clientId: 'custom-client-id' })

    const defaultConfig = result.adapter.connectionManager.getDefaultConnectionConfiguration()
    assert.strictEqual(defaultConfig.clientId, 'custom-client-id')
  })

  it('preserves an existing agent adapter when explicit host auth is supplied', () => {
    const existingAdapter = new CloudAdapter({ clientId: 'existing-client-id' })
    const app = new AgentApplication({ adapter: existingAdapter })
    const result = createCloudAdapter(app, { clientId: 'override-client-id' })

    assert.strictEqual(result.adapter, existingAdapter)
    const defaultConfig = result.adapter.connectionManager.getDefaultConnectionConfiguration()
    assert.strictEqual(defaultConfig.clientId, 'existing-client-id')
  })

  it('uses the resolved authConfig in the adapter', () => {
    const result = createCloudAdapter(new ActivityHandler(), { clientId: 'resolved-client-id' })

    assert.strictEqual(result.adapter.getClientId(), 'resolved-client-id')
  })

  it('scopes an ActivityHandler CloudAdapter to a host-scoped configurationContext', async () => {
    const configurationContext = await createScopedConfigurationContext()
    const result = createCloudAdapter(new ActivityHandler(), undefined, { configurationContext })

    assert.strictEqual(result.adapter.getClientId(), 'scoped-client-id')
    const defaultConfig = result.adapter.connectionManager.getDefaultConnectionConfiguration()
    assert.strictEqual(defaultConfig.clientId, 'scoped-client-id')
  })

  it('keeps a reused AgentApplication adapter authoritative when a different context is supplied', async () => {
    const existingAdapter = new CloudAdapter({ clientId: 'existing-client-id' })
    const app = new AgentApplication({ adapter: existingAdapter })
    const configurationContext = await createScopedConfigurationContext()

    const result = createCloudAdapter(app, undefined, { configurationContext })

    assert.strictEqual(result.adapter, existingAdapter)
    assert.strictEqual(result.adapter.getClientId(), 'existing-client-id')
  })

  it('threads configurationContext adapter and outbound host settings into a new ActivityHandler CloudAdapter', async () => {
    const configurationContext = await createScopedAdapterConfigurationContext()
    const result = createCloudAdapter(new ActivityHandler(), undefined, { configurationContext })

    assert.strictEqual((result.adapter as any)._options.emitStackTrace, true)
    const hostValidator = (result.adapter as any)._hostValidator as OutboundUrlPolicy
    assert.strictEqual(hostValidator.isAllowed('https://scoped.contoso.com'), true)
    assert.strictEqual(hostValidator.isAllowed('https://unscoped.contoso.com'), false)
  })
})
