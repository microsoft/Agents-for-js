/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, addAIToActivity, Attachment, Entity, ClientCitation, SensitivityUsageInfo } from '@microsoft/agents-activity'
import { TurnContext } from '../../turnContext'
import { Citation } from './citation'
import { CitationUtil } from './citationUtil'
import { debug } from '@microsoft/agents-activity/logger'

const logger = debug('agents:streamingResponse')

/**
 * A helper class for streaming responses to the client.
 *
 * @remarks
 * This class is used to send a series of updates to the client in a single response. The expected
 * sequence of calls is:
 *
 * `queueInformativeUpdate()`, `queueTextChunk()`, `queueTextChunk()`, ..., `endStream()`.
 *
 * Once `endStream()` is called, the stream is considered ended and no further updates can be sent.
 */
export class StreamingResponse {
  private readonly _context: TurnContext
  private _nextSequence: number = 1
  private _streamId?: string
  private _message: string = ''
  private _attachments?: Attachment[]
  private _ended = false

  // Queue for outgoing activities
  private _queue: Array<() => Activity> = []
  private _queueSync: Promise<void> | undefined
  private _chunkQueued = false

  // Powered by AI feature flags
  private _enableFeedbackLoop = false
  private _feedbackLoopType?: 'default' | 'custom'
  private _enableGeneratedByAILabel = false
  private _citations?: ClientCitation[] = []
  private _sensitivityLabel?: SensitivityUsageInfo

  /**
     * Creates a new StreamingResponse instance.
     *
     * @param {TurnContext} context - Context for the current turn of conversation with the user.
     * @returns {TurnContext} - The context for the current turn of conversation with the user.
     */
  public constructor (context: TurnContext) {
    this._context = context
  }

  /**
     * Gets the stream ID of the current response.
     *
     * @returns {string | undefined} - The stream ID of the current response.
     *
     * @remarks
     * Assigned after the initial update is sent.
     */
  public get streamId (): string | undefined {
    return this._streamId
  }

  /**
     * Gets the citations of the current response.
     */
  public get citations (): ClientCitation[] | undefined {
    return this._citations
  }

  /**
     * Gets the number of updates sent for the stream.
     *
     * @returns {number} - The number of updates sent for the stream.
     */
  public get updatesSent (): number {
    return this._nextSequence - 1
  }

  /**
     * Queues an informative update to be sent to the client.
     *
     * @param {string} text Text of the update to send.
     */
  public queueInformativeUpdate (text: string): void {
    if (this._ended) {
      throw new Error('The stream has already ended.')
    }

    // Queue a typing activity
    this.queueActivity(() => Activity.fromObject({
      type: 'typing',
      text,
      entities: [{
        type: 'streaminfo',
        streamType: 'informative',
        streamSequence: this._nextSequence++
      }]
    }))
  }

  /**
     * Queues a chunk of partial message text to be sent to the client
     *
     * @param {string} text Partial text of the message to send.
     * @param {Citation[]} citations Citations to be included in the message.
     *
     * @remarks
     * The text we be sent as quickly as possible to the client. Chunks may be combined before
     * delivery to the client.
     *
     */
  public queueTextChunk (text: string, citations?: Citation[]): void {
    if (this._ended) {
      throw new Error('The stream has already ended.')
    }

    // Update full message text
    this._message += text

    // If there are citations, modify the content so that the sources are numbers instead of [doc1], [doc2], etc.
    this._message = CitationUtil.formatCitationsResponse(this._message)

    // Queue the next chunk
    this.queueNextChunk()
  }

  /**
     * Ends the stream by sending the final message to the client.
     *
     * @returns {Promise<void>} - A promise representing the async operation
     */
  public endStream (): Promise<void> {
    if (this._ended) {
      throw new Error('The stream has already ended.')
    }

    // Queue final message
    this._ended = true
    this.queueNextChunk()

    // Wait for the queue to drain
    return this.waitForQueue()
  }

  /**
     * Sets the attachments to attach to the final chunk.
     *
     * @param attachments List of attachments.
     */
  public setAttachments (attachments: Attachment[]): void {
    this._attachments = attachments
  }

  /**
     * Sets the sensitivity label to attach to the final chunk.
     *
     * @param sensitivityLabel The sensitivty label.
     */
  public setSensitivityLabel (sensitivityLabel: SensitivityUsageInfo): void {
    this._sensitivityLabel = sensitivityLabel
  }

  /**
     * Sets the citations for the full message.
     *
     * @param {Citation[]} citations Citations to be included in the message.
     */
  public setCitations (citations: Citation[]): void {
    if (citations.length > 0) {
      if (!this._citations) {
        this._citations = []
      }
      let currPos = this._citations.length

      for (const citation of citations) {
        const clientCitation: ClientCitation = {
          '@type': 'Claim',
          position: currPos + 1,
          appearance: {
            '@type': 'DigitalDocument',
            name: citation.title || `Document #${currPos + 1}`,
            abstract: CitationUtil.snippet(citation.content, 477)
          }
        }
        currPos++
        this._citations.push(clientCitation)
      }
    }
  }

  /**
     * Sets the Feedback Loop in Teams that allows a user to
     * give thumbs up or down to a response.
     * Default is `false`.
     *
     * @param enableFeedbackLoop If true, the feedback loop is enabled.
     */
  public setFeedbackLoop (enableFeedbackLoop: boolean): void {
    this._enableFeedbackLoop = enableFeedbackLoop
  }

  /**
     * Sets the type of UI to use for the feedback loop.
     *
     * @param feedbackLoopType The type of the feedback loop.
     */
  public setFeedbackLoopType (feedbackLoopType: 'default' | 'custom'): void {
    this._feedbackLoopType = feedbackLoopType
  }

  /**
     * Sets the the Generated by AI label in Teams
     * Default is `false`.
     *
     * @param enableGeneratedByAILabel If true, the label is added.
     */
  public setGeneratedByAILabel (enableGeneratedByAILabel: boolean): void {
    this._enableGeneratedByAILabel = enableGeneratedByAILabel
  }

  /**
     * Returns the most recently streamed message.
     *
     * @returns The streamed message.
     */
  public getMessage (): string {
    return this._message
  }

  /**
     * Waits for the outgoing activity queue to be empty.
     *
     * @returns {Promise<void>} - A promise representing the async operation.
     */
  public waitForQueue (): Promise<void> {
    return this._queueSync || Promise.resolve()
  }

  /**
     * Queues the next chunk of text to be sent to the client.
     *
     * @private
     */
  private queueNextChunk (): void {
    // Are we already waiting to send a chunk?
    if (this._chunkQueued) {
      return
    }

    // Queue a chunk of text to be sent
    this._chunkQueued = true
    this.queueActivity(() => {
      this._chunkQueued = false
      if (this._ended) {
        // Send final message
        return Activity.fromObject({
          type: 'message',
          text: this._message || 'end of stream response',
          attachments: this._attachments,
          entities: [{
            type: 'streaminfo',
            streamType: 'final',
            streamSequence: this._nextSequence++
          }]
        })
      } else {
        // Send typing activity
        return Activity.fromObject({
          type: 'typing',
          text: this._message,
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamSequence: this._nextSequence++
          }]
        })
      }
    })
  }

  /**
     * Queues an activity to be sent to the client.
     */
  private queueActivity (factory: () => Activity): void {
    this._queue.push(factory)

    // If there's no sync in progress, start one
    if (!this._queueSync) {
      this._queueSync = this.drainQueue().catch((err) => {
        logger.error(`Error occurred when sending activity while streaming: "${JSON.stringify(err)}".`)
        // throw err
      })
    }
  }

  /**
     * Sends any queued activities to the client until the queue is empty.
     *
     * @returns {Promise<void>} - A promise that will be resolved once the queue is empty.
     * @private
     */
  private async drainQueue (): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<void>(async (resolve, reject) => {
      try {
        logger.debug(`Draining queue with ${this._queue.length} activities.`)
        while (this._queue.length > 0) {
          const factory = this._queue.shift()!
          const activity = factory()
          await this.sendActivity(activity)
        }

        resolve()
      } catch (err) {
        reject(err)
      } finally {
        this._queueSync = undefined
      }
    })
  }

  /**
     * Sends an activity to the client and saves the stream ID returned.
     *
     * @param {Activity} activity - The activity to send.
     * @returns {Promise<void>} - A promise representing the async operation.
     * @private
     */
  private async sendActivity (activity: Activity): Promise<void> {
    // Set activity ID to the assigned stream ID
    if (this._streamId) {
      activity.id = this._streamId
      if (!activity.entities) {
        activity.entities = []
      }
      if (!activity.entities[0]) {
        activity.entities[0] = {} as Entity
      }
      activity.entities[0].streamId = this._streamId
    }

    if (this._citations && this._citations.length > 0 && !this._ended) {
      // Filter out the citations unused in content.
      const currCitations = CitationUtil.getUsedCitations(this._message, this._citations) ?? undefined
      activity.entities!.push({
        type: 'https://schema.org/Message',
        '@type': 'Message',
        '@context': 'https://schema.org',
        '@id': '',
        citation: currCitations
      } as unknown as Entity)
    }

    // Add in Powered by AI feature flags
    if (this._ended) {
      activity.channelData = {
        feedbackLoopEnabled: this._enableFeedbackLoop ?? false,
        ...(this._feedbackLoopType ? { type: this._feedbackLoopType } : {})
      }

      // Add in Generated by AI
      if (this._enableGeneratedByAILabel) {
        addAIToActivity(activity, this._citations, this._sensitivityLabel)
      }
    }

    // Send activity
    const response = await this._context.sendActivity(activity)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Save assigned stream ID
    if (!this._streamId) {
      this._streamId = response?.id
    }
  }
}
