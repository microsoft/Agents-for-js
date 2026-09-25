/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, addAIToActivity, Attachment, Entity, ClientCitation, SensitivityUsageInfo, DeliveryModes, Channels, ExceptionHelper } from '@microsoft/agents-activity'
import { TurnContext } from '../../turnContext'
import { Citation } from './citation'
import { CitationUtil } from './citationUtil'
import { debug } from '@microsoft/agents-telemetry'
import { Errors } from '../../errorHelper'

const logger = debug('agents:streamingResponse')
const teamsStreamTimedOut = 'Content stream finished due to exceeded streaming time.'
const defaultStreamingTakingTooLongMessage = 'The response is taking longer than expected. Please wait while we continue to generate the response.'
const m365StreamingTimeoutMs = 105000
const m365WorkingNoticeIntervalMs = 35000

/**
 * Results for streaming response operations.
 */
export enum StreamingResponseResult {
  /**
   * The operation was successful.
   */
  Success = 'success',
  /**
   * The stream has already ended.
   */
  AlreadyEnded = 'alreadyEnded',
  /**
   * The user canceled the streaming response.
   */
  UserCanceled = 'userCanceled',
  /**
   * An error occurred during the streaming response.
   */
  Error = 'error'
}

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
  private _delayInMs = 250
  private _isStreamingChannel: boolean = true
  private _finalMessage?: Activity
  private _canceled = false
  private _userCanceled = false
  private _streamTimedOut = false
  private _streamTimeoutNotificationSent = false
  private _lastInformationalMessageSent = ''
  private _streamStartedAt?: number
  private _keepAliveTimer?: ReturnType<typeof setTimeout>
  private _streamTimeoutTimer?: ReturnType<typeof setTimeout>
  private _streamingTakingTooLongMessage = defaultStreamingTakingTooLongMessage

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
    this.loadDefaults(context.activity)
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
   * Gets the delay in milliseconds between chunks.
   * @remarks
   * Teams default: 1000 ms
   * Web Chat / Direct Line default: 500 ms
   * Other channels: 250 ms
   */
  public get delayInMs (): number {
    return this._delayInMs
  }

  /**
   * Gets whether the channel supports streaming.
   */
  public get isStreamingChannel (): boolean {
    return this._isStreamingChannel
  }

  /**
   * Gets the message sent when streaming takes longer than the channel allows.
   */
  public get streamingTakingTooLongMessage (): string {
    return this._streamingTakingTooLongMessage
  }

  /**
   * Sets the message sent when streaming takes longer than the channel allows.
   */
  public set streamingTakingTooLongMessage (message: string) {
    this._streamingTakingTooLongMessage = message
  }

  /**
   * Queues an informative update to be sent to the client.
   *
   * @param {string} text Text of the update to send.
   */
  public queueInformativeUpdate (text: string): void {
    if (this.isM365Copilot()) {
      this._lastInformationalMessageSent = text
    }

    if (!this.isStreamingChannel || !text.trim() || this._canceled) {
      return
    }

    if (this._ended) {
      throw ExceptionHelper.generateException(Error, Errors.StreamAlreadyEnded)
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
    if (text === null || text === undefined || this._canceled) {
      return
    }

    if (this._ended) {
      throw ExceptionHelper.generateException(Error, Errors.StreamAlreadyEnded)
    }

    // Update full message text
    this._message += text

    // If there are citations, modify the content so that the sources are numbers instead of [doc1], [doc2], etc.
    this._message = CitationUtil.formatCitationsResponse(this._message)

    if (!this.isStreamingChannel) {
      return
    }

    // Queue the next chunk
    this.queueNextChunk()
  }

  /**
   * Ends the stream by sending the final message to the client.
   *
   * @returns {Promise<StreamingResponseResult>} - StreamingResponseResult with the result of the streaming response.
   */
  public async endStream (): Promise<StreamingResponseResult> {
    if (this._ended) {
      return StreamingResponseResult.AlreadyEnded
    }

    if (this._canceled) {
      return this._userCanceled ? StreamingResponseResult.UserCanceled : StreamingResponseResult.Error
    }

    // Queue final message
    this._ended = true
    this.clearStreamTimers()

    if (!this.isStreamingChannel) {
      // A failed streaming send may still be updating the timed-out activity.
      // Preserve ordering so that the completed response is always the last update.
      await this.waitForQueue()

      if (this._streamTimeoutNotificationSent && !this._message && !this._finalMessage && !this._attachments?.length) {
        return StreamingResponseResult.Success
      }

      const finalMessage = this.createFinalMessage()
      if (this._streamTimedOut) {
        await this.updateActivity(finalMessage)
      } else {
        await this.sendActivity(finalMessage)
      }
      return StreamingResponseResult.Success
    }

    // Queue final message
    this.queueNextChunk()

    // Wait for the queue to drain
    await this.waitForQueue()

    // The final streaming send itself can report that the channel timed out. In
    // that case the queued final activity is discarded and must be applied as
    // an update after the timeout recovery has completed.
    if (this._streamTimedOut) {
      await this.updateActivity(this.createFinalMessage())
    }
    return StreamingResponseResult.Success
  }

  /**
   * Resets the streaming response to its initial state.
   * If the stream is still running, this will wait for completion.
   */
  public async reset () : Promise<void> {
    await this.waitForQueue()
    this.clearStreamTimers()

    this._queueSync = undefined
    this._queue = []
    this._chunkQueued = false
    this._ended = false
    this._canceled = false
    this._userCanceled = false
    this._streamTimedOut = false
    this._streamTimeoutNotificationSent = false
    this._lastInformationalMessageSent = ''
    this._streamStartedAt = undefined
    this._message = ''
    this._nextSequence = 1
    this._streamId = undefined
    this._attachments = undefined
  }

  /**
   * Set Activity that will be (optionally) used for the final streaming message.
   */
  public setFinalMessage (activity: Activity): void {
    this._finalMessage = activity
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
   * Adds an attachment to the collection of attachments for the final message.
   *
   * @param attachment The attachment to add. Must not be null or undefined.
   * @throws Error if attachment is null or undefined.
   *
   * @remarks
   * Attachments are only included in the final message sent by `endStream()`.
   * They are not sent in intermediate typing activities.
   */
  public addAttachment (attachment: Attachment): void {
    if (attachment === null || attachment === undefined) {
      throw ExceptionHelper.generateException(Error, Errors.AttachmentNullOrUndefined)
    }

    if (!this._attachments) {
      this._attachments = []
    }
    this._attachments.push(attachment)
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
            abstract: CitationUtil.snippet(citation.content, 477),
            url: citation.url!
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
   * Sets the delay in milliseconds between chunks.
   * @param delayInMs The delay in milliseconds.
   */
  public setDelayInMs (delayInMs: number): void {
    this._delayInMs = delayInMs
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
   * Ends the streaming portion of a response while allowing the underlying operation to continue.
   *
   * @param message Message sent to notify the user that streaming has stopped.
   * @returns Whether the streaming response was stopped.
   */
  public async sendStreamTimedOutNotification (message: string): Promise<boolean> {
    if (this._ended || this._canceled || !this.isStreamingChannel) {
      return false
    }

    // Ensure any in-flight queued sends complete before we send the timeout notification.
    await this.waitForQueue()

    await this.sendActivity(this.createStreamStoppedMessage(message))
    this._streamTimeoutNotificationSent = true
    this._isStreamingChannel = false
    this._queue = []
    this._chunkQueued = false
    this.clearStreamTimers()
    return true
  }

  /**
   * Waits for the outgoing activity queue to be empty.
   *
   * @returns {Promise<void>} - A promise representing the async operation.
   */
  private waitForQueue (): Promise<void> {
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
        return this.createFinalMessage()
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
    this._queueSync ??= this.drainQueue()
  }

  /**
   * Sends any queued activities to the client until the queue is empty.
   *
   * @returns {Promise<void>} - A promise that will be resolved once the queue is empty.
   * @private
   */
  private async drainQueue (): Promise<void> {
    try {
      logger.debug(`Draining queue with ${this._queue.length} activities.`)
      while (this._queue.length > 0) {
        const factory = this._queue.shift()!
        const activity = factory()
        await this.sendActivity(activity)
      }
    } catch (err) {
      logger.error(`Error occurred when draining activity queue: "${JSON.stringify(err)}".`)
    } finally {
      this._queueSync = undefined
    }
  }

  /**
   * Creates the final message to be sent at the end of the stream.
   */
  private createFinalMessage (): Activity {
    const activity = this._finalMessage ?? new Activity('message')
    activity.type = 'message'

    if (!this._finalMessage) {
      activity.text = this._message || 'end of stream response'
    }

    activity.entities ??= []
    activity.attachments = this._attachments
    this._nextSequence++ // Increment sequence for final message, even if not streaming.

    if (this._streamTimedOut && this._streamId) {
      activity.id = this._streamId
    }

    if (this.isStreamingChannel) {
      activity.entities.push({
        type: 'streaminfo',
        streamType: 'final',
        streamSequence: this._nextSequence
      })
    }

    return activity
  }

  /**
   * Creates the final streaming notification used when streaming stops but processing continues.
   */
  private createStreamStoppedMessage (message: string): Activity {
    return Activity.fromObject({
      type: 'message',
      text: message || 'No text was streamed',
      entities: [{
        type: 'streaminfo',
        streamType: 'final',
        streamResult: this._message ? 'success' : 'error',
        streamSequence: this._nextSequence++
      }]
    })
  }

  /**
   * Creates a checkpoint or final notification for a channel streaming timeout.
   */
  private createStreamTimedOutMessage (addStreamFinal = false): Activity {
    const text = this._message
      ? `${this._message}\n\n${this.streamingTakingTooLongMessage}\n`
      : this.streamingTakingTooLongMessage
    const activity = Activity.fromObject({
      type: 'message',
      text,
      entities: []
    })

    if (this._streamId) {
      activity.id = this._streamId
    }

    if (addStreamFinal) {
      activity.entities!.push({
        type: 'streaminfo',
        streamType: 'final',
        streamId: this._streamId,
        streamResult: this._message ? 'success' : 'error',
        streamSequence: this._nextSequence++
      })
    }

    return activity
  }

  /**
   * Creates the last streaming update sent before proactively finalizing an
   * M365 Copilot stream.
   */
  private createStreamTimedOutStreamingUpdate (): Activity {
    const text = this._message
      ? `${this._message}\n\n${this.streamingTakingTooLongMessage}\n`
      : this.streamingTakingTooLongMessage

    return Activity.fromObject({
      type: 'typing',
      text,
      entities: [{
        type: 'streaminfo',
        streamType: 'streaming',
        streamSequence: this._nextSequence++
      }]
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
    this.startStreamTimers()

    // Only streaming activities should carry stream metadata. Once streaming
    // has stopped, the completed response must be sent as an independent
    // message without an orphaned streamId entity.
    const streamInfo = activity.entities?.find(entity => entity.type?.toLowerCase() === 'streaminfo')
    if (this._streamId && streamInfo) {
      activity.id = this._streamId
      streamInfo.streamId = this._streamId
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

    try {
      const response = await this._context.sendActivity(activity)
      if (!this._streamId) {
        this._streamId = response?.id
      }
      if (this.isM365Copilot() && this.isStreamingChannel && !this._ended) {
        this.scheduleKeepAlive()
      }
      await new Promise((resolve) => setTimeout(resolve, this.delayInMs))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this._canceled = true
      this._queue = []
      this._chunkQueued = false
      this.clearStreamTimers()

      // MS Teams code list: https://learn.microsoft.com/en-us/microsoftteams/platform/bots/streaming-ux?tabs=jsts#error-codes
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('contentstreamnotallowed') && normalizedMessage.includes(teamsStreamTimedOut.toLowerCase())) {
        logger.warn('Client canceled due to exceeded allowed streaming time.', { originalError: message })
        this._streamTimedOut = true
        this._canceled = false
        this._isStreamingChannel = false
        await this.updateActivity(this.createStreamTimedOutMessage())
      } else if (normalizedMessage.includes('contentstreamnotallowed')) {
        logger.warn('Streaming content is not allowed by the client side.', { originalError: message })
        this._userCanceled = true
      } else if (normalizedMessage.includes('badargument') && normalizedMessage.includes('streaming api is not enabled')) {
        logger.warn('Interaction does not support streaming. Defaulting to non-streaming response.', { originalError: message })
        this._canceled = false
        this._isStreamingChannel = false
      } else {
        logger.error('Exception during StreamingResponse sendActivity.', { originalError: message })
      }
    }
  }

  /**
   * Updates the existing streaming activity without allowing failures to escape the queue.
   */
  private async updateActivity (activity: Activity): Promise<void> {
    try {
      await this._context.updateActivity(activity)
    } catch (error) {
      logger.warn('Exception during StreamingResponse updateActivity.', { originalError: (error as Error).message })
    }
  }

  /**
   * Starts M365 Copilot keep-alive and maximum-duration timers.
   */
  private startStreamTimers (): void {
    if (!this.isM365Copilot() || !this.isStreamingChannel || this._streamStartedAt !== undefined) {
      return
    }

    this._streamStartedAt = Date.now()
    this.scheduleKeepAlive()
    this._streamTimeoutTimer = setTimeout(() => {
      this.handleM365StreamTimeout().catch(error => {
        logger.error('Error handling the M365 Copilot streaming timeout.', { originalError: (error as Error).message })
      })
    }, m365StreamingTimeoutMs)
  }

  /**
   * Schedules an informative update before M365 Copilot's idle timeout.
   */
  private scheduleKeepAlive (): void {
    if (!this.isM365Copilot() || !this.isStreamingChannel || this._ended) {
      return
    }

    if (this._keepAliveTimer) {
      clearTimeout(this._keepAliveTimer)
    }

    this._keepAliveTimer = setTimeout(() => {
      this._keepAliveTimer = undefined
      if (!this._ended && this.isStreamingChannel && this._queue.length === 0) {
        this.queueInformativeUpdate(this._lastInformationalMessageSent.trim()
          ? this._lastInformationalMessageSent
          : this.streamingTakingTooLongMessage)
      }
    }, m365WorkingNoticeIntervalMs)
  }

  /**
   * Finalizes an M365 Copilot stream that reached the channel duration limit.
   */
  private async handleM365StreamTimeout (): Promise<void> {
    if (this._ended || this._canceled || !this.isStreamingChannel || !this.isM365Copilot()) {
      return
    }

    logger.warn('M365 Copilot streaming response reached the maximum duration. Finalizing the stream and continuing in non-streaming mode.', {
      streamId: this._streamId,
      elapsedMs: this._streamStartedAt === undefined ? undefined : Date.now() - this._streamStartedAt
    })

    const timedOutActivities = this._message
      ? [this.createStreamTimedOutStreamingUpdate(), this.createStreamTimedOutMessage(true)]
      : [this.createStreamTimedOutMessage(true)]

    this._streamTimeoutNotificationSent = true
    this._isStreamingChannel = false
    this._queue = []
    this._chunkQueued = false
    this.clearStreamTimers()

    // Queue these behind any in-flight send. Clearing pending activities and
    // using the same drain prevents out-of-order stream sequences.
    for (const activity of timedOutActivities) {
      this.queueActivity(() => activity)
    }

    await this.waitForQueue()
  }

  /**
   * Stops active channel timeout timers.
   */
  private clearStreamTimers (): void {
    if (this._keepAliveTimer) {
      clearTimeout(this._keepAliveTimer)
      this._keepAliveTimer = undefined
    }
    if (this._streamTimeoutTimer) {
      clearTimeout(this._streamTimeoutTimer)
      this._streamTimeoutTimer = undefined
    }
  }

  private isM365Copilot (): boolean {
    return this._context.activity.channelId?.toLocaleLowerCase() === Channels.M365Copilot.toLocaleLowerCase()
  }

  /**
   * Loads default values for the streaming response.
   */
  private loadDefaults (activity: Activity) {
    if (!activity) {
      return
    }

    if (activity.deliveryMode === DeliveryModes.ExpectReplies) {
      this._isStreamingChannel = false
    } else if (Channels.Msteams === activity.channelIdChannel) {
      this._isStreamingChannel = true
      this._delayInMs = 1000
    } else if (Channels.Webchat === activity.channelId || Channels.Directline === activity.channelId || Channels.Emulator === activity.channelId) {
      this._isStreamingChannel = true
      this._delayInMs = 500
    } else {
      this._isStreamingChannel = false
    }
  }
}
