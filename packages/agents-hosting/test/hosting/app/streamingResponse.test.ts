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
    clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout'],
    })
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

  it('should preserve whitespace-only chunks (spaces) in getMessage()', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.queueTextChunk('Hello')
    streamingResponse.queueTextChunk('  ')
    streamingResponse.queueTextChunk('World')
    clock.tick(1500)

    assert.equal(streamingResponse.getMessage(), 'Hello  World')

    formatCitationsStub.restore()
  })

  it('should preserve whitespace-only chunks (newlines) in getMessage()', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.queueTextChunk('Line 1')
    streamingResponse.queueTextChunk('\n\n')
    streamingResponse.queueTextChunk('Line 2')
    clock.tick(1500)

    assert.equal(streamingResponse.getMessage(), 'Line 1\n\nLine 2')

    formatCitationsStub.restore()
  })

  it('should include whitespace-only chunks in the sent typing activity text', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.queueTextChunk('\n\n')

    // sendActivity is called synchronously when queuing a chunk
    sinon.assert.calledOnce(mockContext.sendActivity)
    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.text, '\n\n')

    formatCitationsStub.restore()
  })

  it('should skip null and undefined chunks but not whitespace-only chunks', () => {
    const formatCitationsStub = sinon.stub(CitationUtil, 'formatCitationsResponse').callsFake(msg => msg)

    streamingResponse.queueTextChunk('Hello')
    streamingResponse.queueTextChunk(null as unknown as string)
    streamingResponse.queueTextChunk(undefined as unknown as string)
    streamingResponse.queueTextChunk(' ')
    clock.tick(1500)

    assert.equal(streamingResponse.getMessage(), 'Hello ')

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

  it('addAttachment - should include attachment in final message', () => {
    const attachment: Attachment = { contentType: 'text/plain', name: 'test.txt', content: 'hello' }

    streamingResponse.addAttachment(attachment)
    streamingResponse.endStream()

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.ok(activity.attachments)
    assert.equal(activity.attachments!.length, 1)
    assert.strictEqual(activity.attachments![0], attachment)
  })

  it('addAttachment - should throw when attachment is null', () => {
    assert.throws(() => streamingResponse.addAttachment(null as any))
  })

  it('addAttachment - should throw when attachment is undefined', () => {
    assert.throws(() => streamingResponse.addAttachment(undefined as any))
  })

  it('addAttachment - should accumulate multiple attachments', () => {
    streamingResponse.addAttachment({ contentType: 'text/plain', content: 'one' })
    streamingResponse.addAttachment({ contentType: 'image/png', content: 'two' })
    streamingResponse.endStream()

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.attachments!.length, 2)
  })

  it('addAttachment - should clear attachments on reset', async () => {
    streamingResponse.addAttachment({ contentType: 'text/plain', content: 'data' })
    // Queue is empty so reset() resolves immediately (next microtask)
    await streamingResponse.reset()

    streamingResponse.endStream()

    const activity = mockContext.sendActivity.firstCall.args[0] as Activity
    assert.equal(activity.attachments, undefined)
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

  it('should handle queue draining errors gracefully', async () => {
    mockContext.sendActivity.rejects(new Error('Send failed'))

    streamingResponse.queueInformativeUpdate('test')
    await clock.tickAsync(1500)

    // Should not throw, error is caught and logged
    assert.doesNotThrow(() => {
      streamingResponse.queueTextChunk('more text')
    })
  })

  it('should update the streamed activity when the channel streaming timeout is reported', async () => {
    mockContext.sendActivity.onSecondCall().rejects(
      new Error('ContentStreamNotAllowed: Content stream finished due to exceeded streaming time.')
    )

    streamingResponse.queueInformativeUpdate('Starting...')
    await clock.tickAsync(500)
    streamingResponse.queueTextChunk('Completed response text.')

    // End immediately, as real callers do after queueing their final chunk.
    // The timeout response arrives while endStream is waiting for the queue.
    const endPromise = streamingResponse.endStream()
    await clock.tickAsync(500)

    assert.equal(streamingResponse.isStreamingChannel, false)
    const result = await endPromise

    assert.equal(result, StreamingResponseResult.Success)
    sinon.assert.calledTwice(mockContext.updateActivity)
    const checkpoint = mockContext.updateActivity.firstCall.args[0] as Activity
    assert.equal(checkpoint.id, 'test-stream-id')
    assert.equal(checkpoint.type, 'message')
    assert.match(checkpoint.text!, /taking longer than expected/)

    const finalActivity = mockContext.updateActivity.secondCall.args[0] as Activity
    assert.equal(finalActivity.id, 'test-stream-id')
    assert.equal(finalActivity.type, 'message')
    assert.equal(finalActivity.text, 'Completed response text.')
  })

  it('should preserve an M365 Copilot message when the channel streaming timeout is reported', async () => {
    mockContext = createContext({ channelId: 'msteams:copilot' })
    mockContext.sendActivity.onSecondCall().rejects(
      new Error('ContentStreamNotAllowed: Content stream finished due to exceeded streaming time.')
    )
    streamingResponse = new StreamingResponse(mockContext)

    streamingResponse.queueInformativeUpdate('Starting...')
    await clock.tickAsync(1000)
    streamingResponse.queueTextChunk('Completed response text.')
    const endPromise = streamingResponse.endStream()
    await clock.tickAsync(1000)

    assert.equal(await endPromise, StreamingResponseResult.Success)
    sinon.assert.calledTwice(mockContext.updateActivity)
    assert.equal((mockContext.updateActivity.firstCall.args[0] as Activity).type, 'message')
    assert.equal((mockContext.updateActivity.secondCall.args[0] as Activity).type, 'message')
    assert.equal((mockContext.updateActivity.secondCall.args[0] as Activity).text, 'Completed response text.')
  })

  it('should stop streaming after a timeout notification and send the completed response normally', async () => {
    streamingResponse.queueInformativeUpdate('Starting...')
    await clock.tickAsync(500)

    const timeoutPromise = streamingResponse.sendStreamTimedOutNotification('Streaming timed out.')
    await clock.tickAsync(500)
    assert.equal(await timeoutPromise, true)
    assert.equal(streamingResponse.isStreamingChannel, false)

    streamingResponse.queueTextChunk('Completed response text.')
    const endPromise = streamingResponse.endStream()
    await clock.tickAsync(500)
    assert.equal(await endPromise, StreamingResponseResult.Success)

    const timeoutActivity = mockContext.sendActivity.secondCall.args[0] as Activity
    assert.equal(timeoutActivity.text, 'Streaming timed out.')
    assert.equal(timeoutActivity.entities?.[0].streamType, 'final')

    const finalActivity = mockContext.sendActivity.thirdCall.args[0] as Activity
    assert.equal(finalActivity.text, 'Completed response text.')
    assert.deepEqual(finalActivity.entities, [])
  })

  it('should send a keep-alive informative update for an idle M365 Copilot stream', async () => {
    mockContext = createContext({ channelId: 'msteams:copilot' })
    streamingResponse = new StreamingResponse(mockContext)
    streamingResponse.streamingTakingTooLongMessage = 'Still working...'

    streamingResponse.queueInformativeUpdate('Starting...')
    await clock.tickAsync(36000)

    sinon.assert.calledTwice(mockContext.sendActivity)
    const keepAlive = mockContext.sendActivity.secondCall.args[0] as Activity
    assert.equal(keepAlive.type, 'typing')
    assert.equal(keepAlive.text, 'Starting...')
    assert.equal(keepAlive.entities?.[0].streamType, 'informative')
  })

  it('should finalize an M365 Copilot stream at the channel timeout and fall back to non-streaming', async () => {
    mockContext = createContext({ channelId: Channels.M365Copilot })
    streamingResponse = new StreamingResponse(mockContext)
    streamingResponse.streamingTakingTooLongMessage = 'Still working...'

    streamingResponse.queueTextChunk('Buffered response')
    await clock.tickAsync(108000)

    assert.equal(streamingResponse.isStreamingChannel, false)
    const timeoutFinal = mockContext.sendActivity.args
      .map(args => args[0] as Activity)
      .find(activity => activity.entities?.some(entity => entity.streamType === 'final'))
    assert.ok(timeoutFinal)
    assert.match(timeoutFinal.text!, /Still working/)

    streamingResponse.queueTextChunk(' complete.')
    const endPromise = streamingResponse.endStream()
    await clock.tickAsync(1000)
    assert.equal(await endPromise, StreamingResponseResult.Success)

    const finalActivity = mockContext.sendActivity.lastCall.args[0] as Activity
    assert.equal(finalActivity.text, 'Buffered response complete.')
    assert.deepEqual(finalActivity.entities, [])
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

  it('should treat Teams with composite channelId (msteams:COPILOT) as a streaming channel with 1000ms delay', () => {
    // When Copilot in Teams is active, channelId is a composite value like 'msteams:COPILOT'
    // but channelIdChannel (primary channel) should still resolve to 'msteams'
    mockContext = createContext({ channelId: `${Channels.Msteams}:COPILOT` })
    streamingResponse = new StreamingResponse(mockContext)

    assert.equal(streamingResponse.delayInMs, 1000)
  })

  it('should treat agentic Teams requests as a streaming channel with 1000ms delay', () => {
    mockContext = createContext({
      channelId: Channels.Msteams,
      recipient: { id: 'recipientId', role: 'agenticUser' }
    })
    streamingResponse = new StreamingResponse(mockContext)

    assert.equal(streamingResponse.isStreamingChannel, true)
    assert.equal(streamingResponse.delayInMs, 1000)
  })

  it('should treat Emulator channel as a streaming channel with 500ms delay', () => {
    mockContext = createContext({ channelId: Channels.Emulator })
    streamingResponse = new StreamingResponse(mockContext)

    assert.equal(streamingResponse.delayInMs, 500)
  })
})
