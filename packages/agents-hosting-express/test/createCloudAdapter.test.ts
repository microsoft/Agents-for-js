/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'assert'
import { ActivityHandler, AgentApplication, CloudAdapter } from '@microsoft/agents-hosting'
import { createCloudAdapter } from '../src/createCloudAdapter'

describe('createCloudAdapter', () => {
  it('should create a new CloudAdapter for an ActivityHandler', () => {
    const handler = new ActivityHandler()
    const result = createCloudAdapter(handler)

    assert.ok(result.adapter instanceof CloudAdapter)
    assert.strictEqual(result.headerPropagation, undefined)
  })

  it('should return adapter and headerPropagation properties', () => {
    const handler = new ActivityHandler()
    const result = createCloudAdapter(handler)

    assert.ok('adapter' in result)
    assert.ok('headerPropagation' in result)
  })

  it('should use provided authConfig when creating a new CloudAdapter', () => {
    const handler = new ActivityHandler()
    const result = createCloudAdapter(handler, { clientId: 'custom-client-id' })

    const defaultConfig = result.adapter.connectionManager.getDefaultConnectionConfiguration()
    assert.strictEqual(defaultConfig.clientId, 'custom-client-id')
  })

  it('should reuse existing agent adapter even when authConfig is provided', () => {
    const existingAdapter = new CloudAdapter({ clientId: 'existing-client-id' })
    const app = new AgentApplication({ adapter: existingAdapter })
    const result = createCloudAdapter(app, { clientId: 'override-client-id' })

    assert.strictEqual(result.adapter, existingAdapter)
    const defaultConfig = result.adapter.connectionManager.getDefaultConnectionConfiguration()
    assert.strictEqual(defaultConfig.clientId, 'existing-client-id')
  })
})
