import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { HeaderPropagation } from '../../src/headerPropagation'
import { applyAgenticHeaders, applyUserAgentHeader, getProductInfo } from '../../src/getProductInfo'

describe('getProductInfo helpers', () => {
  it('should append product info using incoming header casing without requiring key()', () => {
    const headers = new HeaderPropagation({ 'user-agent': 'TestUserAgent/1.0' })

    applyUserAgentHeader(headers)

    assert.equal(headers.outgoing['user-agent'], `TestUserAgent/1.0 ${getProductInfo()}`)
  })

  it('should propagate user agent when incoming header already includes product info', () => {
    const productInfo = getProductInfo()
    const headers = new HeaderPropagation({ 'user-agent': `TestUserAgent/1.0 ${productInfo}` })

    applyUserAgentHeader(headers)

    assert.equal(headers.outgoing['user-agent'], `TestUserAgent/1.0 ${productInfo}`)
  })

  it('should apply agentic headers for agentic activities', () => {
    const headers = new HeaderPropagation({})
    const activity = Activity.fromObject({
      type: ActivityTypes.Message,
      channelId: 'test-channel',
      recipient: {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser',
        agenticAppId: 'agentic-app-id'
      }
    })

    applyAgenticHeaders(headers, activity, 'Valid Agent_1')

    assert.equal(headers.outgoing.AgentRegistrar, 'A365')
    assert.equal(headers.outgoing.AgentName, 'Valid Agent_1')
    assert.equal(headers.outgoing.AgentID, 'agentic-app-id')
    assert.equal(headers.outgoing['Agent-Referrer'], 'test-channel')
  })

  it('should throw when no agent id can be resolved', () => {
    const headers = new HeaderPropagation({})
    const activity = Activity.fromObject({
      type: ActivityTypes.Message,
      channelId: 'test-channel',
    })

    assert.throws(() => applyAgenticHeaders(headers, activity), {
      name: 'Error',
      message: '[-120620] - Agent ID is required to apply outbound agent headers - https://aka.ms/M365AgentsErrorCodesJS/#-120620'
    })
  })
})
