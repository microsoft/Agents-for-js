/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  Activity,
  addAIToActivity,
  Attachment,
  Entity,
} from '@microsoft/agents-activity'
import { TurnContext } from '../../turnContext'
import { Citation } from './citation'
import { CitationUtil } from './citationUtil'
import { debug } from '../../logger'
import {
  ClientCitation,
  SensitivityUsageInfo,
} from '@microsoft/agents-activity/src/entity/AIEntity'

const logger = debug('agents:streamingResponse')

/**
 * A helper class for streaming responses to the client.
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
  private _activityQueueListener: ActivityQueueListener

  // Powered by AI feature flags
  private _enableFeedbackLoop = false
  private _feedbackLoopType?: 'default' | 'custom'
  private _enableGeneratedByAILabel = false
  private _citations?: ClientCitation[] = []
  private _sensitivityLabel?: SensitivityUsageInfo

  /**
   * Creates a new StreamingResponse instance.
   * @param {TurnContext} context - Context for the current turn of conversation with the user.
   * @returns {TurnContext} - The context for the current turn of conversation with the user.
   */
  public constructor (context: TurnContext) {
    this._context = context
    this._activityQueueListener = new ActivityQueueListener()
    this._activityQueueListener.onDrain((activity) =>
      this.sendActivity(activity)
    )
  }

  /**
   * Gets the stream ID of the current response.
   * @returns {string | undefined} - The stream ID of the current response.
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
   * @returns {number} - The number of updates sent for the stream.
   */
  public get updatesSent (): number {
    return this._nextSequence - 1
  }

  /**
   * Queues an informative update to be sent to the client.
   * @param {string} text Text of the update to send.
   */
  public queueInformativeUpdate (text: string): void {
    if (this._ended) {
      throw new Error('The stream has already ended.')
    }

    // Queue a typing activity
    this._activityQueueListener.queue(() =>
      Activity.fromObject({
        type: 'typing',
        text,
        channelData: {
          streamType: 'informative',
          streamSequence: this._nextSequence++,
        } as StreamingChannelData,
      })
    )
  }

  /**
   * Queues a chunk of partial message text to be sent to the client
   * @remarks
   * The text we be sent as quickly as possible to the client. Chunks may be combined before
   * delivery to the client.
   * @param {string} text Partial text of the message to send.
   * @param {Citation[]} citations Citations to be included in the message.
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
    this.queueActivity()
  }

  /**
   * Ends the stream by sending the final message to the client.
   * @returns {Promise<void>} - A promise representing the async operation
   */
  public endStream (): Promise<void> {
    if (this._ended) {
      throw new Error('The stream has already ended.')
    }

    // Queue final message
    this._ended = true
    this.queueActivity()
    this._activityQueueListener.stop()

    // Wait for the queue to drain
    return this.waitForQueue()
  }

  /**
   * Sets the attachments to attach to the final chunk.
   * @param attachments List of attachments.
   */
  public setAttachments (attachments: Attachment[]): void {
    this._attachments = attachments
  }

  /**
   * Sets the sensitivity label to attach to the final chunk.
   * @param sensitivityLabel The sensitivty label.
   */
  public setSensitivityLabel (sensitivityLabel: SensitivityUsageInfo): void {
    this._sensitivityLabel = sensitivityLabel
  }

  /**
   * Sets the citations for the full message.
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
            abstract: CitationUtil.snippet(citation.content, 477),
          },
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
   * @param enableFeedbackLoop If true, the feedback loop is enabled.
   */
  public setFeedbackLoop (enableFeedbackLoop: boolean): void {
    this._enableFeedbackLoop = enableFeedbackLoop
  }

  /**
   * Sets the type of UI to use for the feedback loop.
   * @param feedbackLoopType The type of the feedback loop.
   */
  public setFeedbackLoopType (feedbackLoopType: 'default' | 'custom'): void {
    this._feedbackLoopType = feedbackLoopType
  }

  /**
   * Sets the the Generated by AI label in Teams
   * Default is `false`.
   * @param enableGeneratedByAILabel If true, the label is added.
   */
  public setGeneratedByAILabel (enableGeneratedByAILabel: boolean): void {
    this._enableGeneratedByAILabel = enableGeneratedByAILabel
  }

  /**
   * Returns the most recently streamed message.
   * @returns The streamed message.
   */
  public getMessage (): string {
    return this._message
  }

  /**
   * Waits for the outgoing activity queue to be empty.
   * @returns {Promise<void>} - A promise representing the async operation.
   */
  public waitForQueue (): Promise<void> {
    return this._activityQueueListener.wait()
  }

  /**
   * Queues an activity to be sent to the client.
   * @private
   */
  private queueActivity (): void {
    this._activityQueueListener.queue(() => {
      if (this._ended) {
        // Send final message
        return Activity.fromObject({
          type: 'message',
          text: this._message || 'end of stream response',
          attachments: this._attachments,
          channelData: {
            streamType: 'final',
            streamSequence: this._nextSequence++,
          } as StreamingChannelData,
        })
      } else {
        // Send typing activity
        return Activity.fromObject({
          type: 'typing',
          text: this._message,
          channelData: {
            streamType: 'streaming',
            streamSequence: this._nextSequence++,
          } as StreamingChannelData,
        })
      }
    }, true)
  }

  /**
   * Sends an activity to the client and saves the stream ID returned.
   * @param {Activity} activity - The activity to send.
   * @returns {Promise<void>} - A promise representing the async operation.
   * @private
   */
  private async sendActivity (activity: Activity): Promise<void> {
    // Set activity ID to the assigned stream ID
    if (this._streamId) {
      activity.id = this._streamId
      activity.channelData = Object.assign({}, activity.channelData, {
        streamId: this._streamId,
      })
    }

    activity.entities = [
      {
        type: 'streaminfo',
        ...activity.channelData,
      } as Entity,
    ]

    if (this._citations && this._citations.length > 0 && !this._ended) {
      // Filter out the citations unused in content.
      const currCitations =
        CitationUtil.getUsedCitations(this._message, this._citations) ??
        undefined
      activity.entities.push({
        type: 'https://schema.org/Message',
        '@type': 'Message',
        '@context': 'https://schema.org',
        '@id': '',
        citation: currCitations,
      } as unknown as Entity)
    }

    // Add in Powered by AI feature flags
    if (this._ended) {
      if (this._enableFeedbackLoop && this._feedbackLoopType) {
        activity.channelData = Object.assign({}, activity.channelData, {
          feedbackLoop: { type: this._feedbackLoopType },
        })
      } else {
        activity.channelData = Object.assign({}, activity.channelData, {
          feedbackLoopEnabled: this._enableFeedbackLoop,
        })
      }

      // Add in Generated by AI
      if (this._enableGeneratedByAILabel) {
        addAIToActivity(activity, this._citations, this._sensitivityLabel)
        // activity.entities.push({
        //   type: 'https://schema.org/Message',
        //   '@type': 'Message',
        //   '@context': 'https://schema.org',
        //   '@id': '',
        //   additionalType: ['AIGeneratedContent'],
        //   citation: this._citations && this._citations.length > 0 ? this._citations : [],
        //   usageInfo: this._sensitivityLabel
        // } as unknown as Entity)
      }
    }

    // Send activity
    const response = await this._context.sendActivity(activity)

    // Save assigned stream ID
    if (!this._streamId) {
      this._streamId = response?.id
    }
  }
}

/**
 * @private
 * Structure of the outgoing channelData field for streaming responses.
 * @remarks
 * The expected sequence of streamTypes is:
 *
 * `informative`, `streaming`, `streaming`, ..., `final`.
 *
 * Once a `final` message is sent, the stream is considered ended.
 */
interface StreamingChannelData {
  /**
   * The type of message being sent.
   * @remarks
   * `informative` - An informative update.
   * `streaming` - A chunk of partial message text.
   * `final` - The final message.
   */
  streamType: 'informative' | 'streaming' | 'final';

  /**
   * Sequence number of the message in the stream.
   * @remarks
   * Starts at 1 for the first message and increments from there.
   */
  streamSequence: number;

  /**
   * ID of the stream.
   * @remarks
   * Assigned after the initial update is sent.
   */
  streamId?: string;
}

/**
 * @private
 * A listener to queue activities and drain them in a controlled manner.
 * @remarks
 * When queuing activities, this class will ensure that the factory function is called less often
 * and combine multiple Activity messages into one [chunks]. While also allowing to queue informative updates.
 *
 */
class ActivityQueueListener {
  private _queue: Array<() => Activity> = []
  private _stop: boolean = false
  private _added: boolean = false
  private _queueSync: Promise<void> | undefined
  private _drainCallback?: (activity: Activity) => Promise<void>
  private _waitingIterator?: (() => void) | null

  async * [Symbol.asyncIterator] (): AsyncIterator<
    ActivityQueueListener['_queue'][number]
  > {
    while (this._queue.length > 0) {
      yield this._queue.shift()!

      // When stoped, continue emptying the queue.
      if (this._stop) {
        continue
      }

      const promise = this.waitIterator()
      this._added = false

      // Allow some time for new activities to be added to the queue.
      await new Promise((resolve) => setTimeout(resolve, 15000))
      await promise
    }
  }

  /**
   * Listens for the drain event and calls the provided callback function.
   * @param callback - The callback function to call when the queue is drained.
   * @remarks
   * The callback function will receive the Activity that was drained from the queue.
   */
  onDrain (callback: (activity: Activity) => Promise<void>) {
    this._drainCallback = callback
  }

  /**
   * Queues an activity to be sent later.
   * @param factory - A factory function that creates the Activity to be queued.
   * @param isChunk - If true, the activity is considered a chunk.
   * @remarks
   * If `isChunk` is true, it will try to reduce the number of calls to the factory function.
   * e.g. concatenating multiple Activity messages into one.
   */
  queue (factory: () => Activity, isChunk: boolean = false) {
    if (this._stop) {
      logger.warn('Unable to add Activity to queue. Draining already stopped.')
      return
    }

    // This in combination with the waitIterator() method, will ensure that
    // the factory is called less often and combine multiple messages into one.
    if (this._added && isChunk) {
      return
    }

    this._added = true
    this._queue.push(factory)
    this.releaseIterator()

    logger.debug(`[queue:${this._queue.length}] Activity queued.`)
    this._queueSync ??= this.drain()
  }

  /**
   * Stops draining the queue.
   * @remarks
   * This will stop the iterator from waiting for new activities and will allow it to continue
   * emptying the queue.
   */
  stop () {
    if (this._stop) {
      logger.warn('Draining already stopped.')
      return
    }

    logger.debug(`[queue:${this._queue.length}] Stop draining.`)
    this._stop = true
    this._added = false
  }

  /**
   * Waits for the queue to be drained.
   * @returns {Promise<void>} - A promise representing the async operation.
   */
  wait () {
    return this._queueSync || Promise.resolve()
  }

  /**
   * Starts draining the queue and sharing the activities with the drain callback.
   */
  private async drain () {
    try {
      logger.debug('Draining ...')
      for await (const factory of this) {
        const activity = factory()
        logger.debug(
          `Draining activity: [${activity.type}] '${activity.text}'`
        )
        await this._drainCallback?.(activity)
      }
    } catch (err) {
      logger.error('Error occured while draining.', err)
      throw err
    } finally {
      logger.debug('Draining finished.')
      this._queueSync = undefined
    }
  }

  /**
   * Waits for the next activity to be added to the queue.
   * @remarks
   * If no activity is added within 10 seconds, it will resolve the promise, causing a timeout.
   * This is to prevent the iterator from hanging indefinitely.
   * @returns {Promise<void>} - A promise representing the async operation.
   */
  private waitIterator (): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        logger.warn(
          'Iterator timed out after 10 seconds while waiting for next activity.'
        )
        resolve()
      }, 20000)
      this._waitingIterator = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  /**
   * Releases the waiting iterator, allowing it to continue.
   * @remarks
   * This is called when a new activity is added to the queue.
   */
  private releaseIterator () {
    if (this._waitingIterator) {
      this._waitingIterator()
      this._waitingIterator = null
    }
  }
}
