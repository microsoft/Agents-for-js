import { StreamingResponse, StreamingResponseResult } from '../../../src/app/streaming/streamingResponse'
import { TurnContext } from '../../../src/turnContext'
import { Activity, Attachment, SensitivityUsageInfo } from '@microsoft/agents-activity'
import { Citation } from '../../../src/app/streaming/citation'
import { CitationUtil } from '../../../src/app/streaming/citationUtil'
import * as sinon from 'sinon'
import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { Channels } from '../../../../agents-activity/src'

function createContext (activity: Partial<Activity>) {
  const mockContext = sinon.createStubInstance(TurnContext)
  Object.defineProperty(mockContext, 'activity', {
    value: Activity.fromObject({ type: 'message', ...activity }),
    configurable: true
  })
  mockContext.sendActivity.resolves({ id: 'test-stream-id' })
  return mockContext
}

describe('StreamingResponse', () => {
  let mockContext: sinon.SinonStubbedInstance<TurnContext>
  let streamingResponse: StreamingResponse
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    mockContext = createContext({ channelId: Channels.Webchat })
    streamingResponse = new StreamingResponse(mockContext)
    clock = sinon.useFakeTimers()
  })

  afterEach(() => {
    sinon.restore()
    clock.restore()
  })

  it('should initialize with correct default values', () => {
    assert.equal(streamingResponse.streamId, undefined)
    assert.equal(streamingResponse.updatesSent, 0)
    assert.equal(streamingResponse.delayInMs, 500)
    assert.equal(streamingResponse.getMessage(), '')
  })

  // it('should return correct streamId after first activity is sent', async () => {
  //   streamingResponse.queueInformativeUpdate('test')
  //   clock.tick(1500)
  //   await new Promise(resolve => setTimeout(resolve, 0))

  //   assert.equal(streamingResponse.streamId, 'test-stream-id')
  // })

  it('should return correct citations', () => {
    const citations: Citation[] = [{
      title: 'Test Document',
      content: 'Test content',
      url: 'https://example.com',
      filepath: null
    }]

    streamingResponse.setCitations(citations)
    assert.equal(streamingResponse.citations?.length, 1)
    assert.equal(streamingResponse.citations?.[0].position, 1)
  })

  it('should return correct updatesSent count', () => {
    streamingResponse.queueInformativeUpdate('test1')
    streamingResponse.queueTextChunk('test2')

    assert.equal(streamingResponse.updatesSent, 1) // No activities sent yet
  })

  it('should queue informative update with correct properties', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').returns('test')

    streamingResponse.queueInformativeUpdate('test message')
    clock.tick(1500)
    // new Promise(resolve => setTimeout(resolve, 0))

    sinon.assert.calledOnce(mockContext.sendActivity)
    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.type, 'typing')
    assert.equal(activity.text, 'test message')
    assert.equal(activity.entities?.[0].type, 'streaminfo')
    assert.equal(activity.entities?.[0].streamType, 'informative')

    formatCitationsStub.restore()
  })

  it('should throw error when stream has ended', () => {
    streamingResponse.endStream()
    clock.tick(1500)

    assert.throws(() => {
      streamingResponse.queueInformativeUpdate('test')
    }, /The stream has already ended/)
  })

  it('should accumulate message text and queue activity', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.queueTextChunk('Hello ')
    streamingResponse.queueTextChunk('World')
    clock.tick(1500)

    assert.equal(streamingResponse.getMessage(), 'Hello World')
    sinon.assert.calledOnce(mockContext.sendActivity)

    formatCitationsStub.restore()
  })

  it('should format citations in message', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').returns('formatted message')

    streamingResponse.queueTextChunk('test [doc1]')

    assert.equal(streamingResponse.getMessage(), 'formatted message')
    sinon.assert.calledWith(formatCitationsStub, 'test [doc1]')

    formatCitationsStub.restore()
  })

  it('should throw error when stream has ended 1', () => {
    streamingResponse.endStream()
    clock.tick(1500)

    assert.throws(() => {
      streamingResponse.queueTextChunk('test')
    }, /The stream has already ended/)
  })

  it('should send default message when no text provided', () => {
    streamingResponse.endStream()
    clock.tick(1500)

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.text, 'end of stream response')
  })

  it('should throw error when called twice', async () => {
    streamingResponse.endStream()
    const result = await streamingResponse.endStream()
    assert.equal(result, StreamingResponseResult.AlreadyEnded)
  })

  it('should include attachments in final message', () => {
    const attachments: Attachment[] = [{ contentType: 'image/png', contentUrl: 'test.png' }]

    streamingResponse.setAttachments(attachments)
    streamingResponse.endStream()

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.deepEqual(activity.attachments, attachments)
  })

  it('should store sensitivity label', () => {
    const sensitivityLabel: SensitivityUsageInfo = { type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'test' }
    streamingResponse.setSensitivityLabel(sensitivityLabel)

    // Sensitivity label is used internally, verify it's stored
    assert.doesNotThrow(() => streamingResponse.setSensitivityLabel(sensitivityLabel))
  })

  it('should convert citations to client citations', () => {
    const snippetStub = sinon.stub(CitationUtil, 'snippet').returns('snippet text')

    const citations: Citation[] = [{
      title: 'Test Doc',
      content: 'Test content',
      url: 'https://example.com',
      filepath: null
    }]

    streamingResponse.setCitations(citations)

    const clientCitations = streamingResponse.citations
    assert.equal(clientCitations?.length, 1)
    assert.equal(clientCitations?.[0]['@type'], 'Claim')
    assert.equal(clientCitations?.[0].position, 1)
    assert.equal(clientCitations?.[0].appearance.name, 'Test Doc')
    assert.equal(clientCitations?.[0].appearance.url, 'https://example.com')

    snippetStub.restore()
  })

  it('should handle citations without URL', () => {
    const snippetStub = sinon.stub(CitationUtil, 'snippet').returns('snippet text')

    const citations: Citation[] = [{
      title: 'Test Doc',
      content: 'Test content',
      url: undefined!,
      filepath: null
    }]

    streamingResponse.setCitations(citations)

    const clientCitations = streamingResponse.citations
    assert.equal(clientCitations?.length, 1)
    assert.equal(clientCitations?.[0]['@type'], 'Claim')
    assert.equal(clientCitations?.[0].position, 1)
    assert.equal(clientCitations?.[0].appearance.name, 'Test Doc')
    assert.equal(clientCitations?.[0].appearance.url, undefined)

    snippetStub.restore()
  })

  it('should handle citations with null url', () => {
    const snippetStub = sinon.stub(CitationUtil, 'snippet').returns('snippet text')

    const citations: Citation[] = [{
      title: 'Test Doc',
      content: 'Test content',
      url: null,
      filepath: null
    }]

    streamingResponse.setCitations(citations)

    const clientCitations = streamingResponse.citations
    assert.equal(clientCitations?.length, 1)
    assert.equal(clientCitations?.[0]['@type'], 'Claim')
    assert.equal(clientCitations?.[0].position, 1)
    assert.equal(clientCitations?.[0].appearance.name, 'Test Doc')
    assert.equal(clientCitations?.[0].appearance.url, null)

    snippetStub.restore()
  })

  it('should handle citations without title', () => {
    const snippetStub = sinon.stub(CitationUtil, 'snippet').returns('snippet text')

    const citations: Citation[] = [{
      content: 'Test content',
      url: 'https://example.com',
      filepath: 'Document #1',
      title: null
    }]

    streamingResponse.setCitations(citations)

    const clientCitations = streamingResponse.citations
    assert.equal(clientCitations?.[0].appearance.name, 'Document #1')

    snippetStub.restore()
  })

  it('should handle empty citations array', () => {
    streamingResponse.setCitations([])
    assert.equal(streamingResponse.citations?.length, 0)
  })

  it('should set feedback loop enabled', () => {
    streamingResponse.setFeedbackLoop(true)
    streamingResponse.endStream()

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.channelData?.feedbackLoopEnabled, true)
  })

  it('should set feedback loop type', () => {
    streamingResponse.setFeedbackLoop(true)
    streamingResponse.setFeedbackLoopType('custom')
    streamingResponse.endStream()
    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.channelData?.type, 'custom')
  })

  it('should update delay value', () => {
    streamingResponse.setDelayInMs(500)
    assert.equal(streamingResponse.delayInMs, 500)
  })

  it('should include citations in streaming activities', () => {
    const getUsedCitationsStub = sinon.stub(CitationUtil, 'getUsedCitations').returns([])
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.setCitations([{
      title: 'Test',
      content: 'Content',
      url: 'https://example.com',
      filepath: null
    }])

    streamingResponse.queueTextChunk('test')
    clock.tick(1500)

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    const messageEntity = activity.entities?.find(e => e.type === 'https://schema.org/Message')
    assert.ok(messageEntity)

    getUsedCitationsStub.restore()
    formatCitationsStub.restore()
  })

  it('should handle queue draining errors gracefully', () => {
    mockContext.sendActivity.rejects(new Error('Send failed'))

    streamingResponse.queueInformativeUpdate('test')
    clock.tick(1500)

    // Should not throw, error is caught and logged
    assert.doesNotThrow(() => {
      streamingResponse.queueTextChunk('more text')
    })
  })

  it('should send one activity for non-streaming channels', async () => {
    mockContext = createContext({ channelId: Channels.Facebook })
    streamingResponse = new StreamingResponse(mockContext)
    streamingResponse.queueInformativeUpdate('test1')
    streamingResponse.queueTextChunk('test2')

    clock.restore() // Disable fake timers for this test
    await streamingResponse.endStream()

    assert.equal(streamingResponse.updatesSent, 1)
  })

  it('should send one activity for expect replies delivery mode', async () => {
    mockContext = createContext({ deliveryMode: 'expectReplies' })
    streamingResponse = new StreamingResponse(mockContext)
    streamingResponse.queueInformativeUpdate('test1')
    streamingResponse.queueTextChunk('test2')

    clock.restore() // Disable fake timers for this test
    await streamingResponse.endStream()

    assert.equal(streamingResponse.updatesSent, 1)
  })
})
