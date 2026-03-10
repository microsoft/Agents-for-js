/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEventSource, EventSourceClient } from 'eventsource-client'
import { ConnectionSettings } from './connectionSettings'
import { getCopilotStudioConnectionUrl, getCopilotStudioSubscribeUrl } from './powerPlatformEnvironment'
import { Activity, ActivityTypes, ConversationAccount } from '@microsoft/agents-activity'
import { ExecuteTurnRequest } from './executeTurnRequest'
import { debug } from '@microsoft/agents-activity/logger'
import { UserAgentHelper } from './userAgentHelper'
import { ScopeHelper } from './scopeHelper'
import { StartRequest } from './startRequest'
import { StartResponse, ExecuteTurnResponse, createStartResponse, createExecuteTurnResponse } from './responses'
import { SubscribeEvent } from './subscribeEvent'

const logger = debug('copilot-studio:client')

/**
 * Client for interacting with Microsoft Copilot Studio services.
 * Provides functionality to start conversations and send messages to Copilot Studio bots.
 */
export class CopilotStudioClient {
  /** Header key for conversation ID. */
  private static readonly conversationIdHeaderKey: string = 'x-ms-conversationid'
  /** Island Header key */
  private static readonly islandExperimentalUrlHeaderKey: string = 'x-ms-d2e-experimental'

  /** The ID of the current conversation. */
  private conversationId: string = ''
  /** The connection settings for the client. */
  private readonly settings: ConnectionSettings
  /** The authenticaton token. */
  private readonly token: string

  /**
   * Returns the scope URL needed to connect to Copilot Studio from the connection settings.
   * This is used for authentication token audience configuration.
   * @param settings Copilot Studio connection settings.
   * @returns The scope URL for token audience.
   * @deprecated Use ScopeHelper.getScopeFromSettings instead.
   */
  static scopeFromSettings: (settings: ConnectionSettings) => string = ScopeHelper.getScopeFromSettings

  /**
   * Creates an instance of CopilotStudioClient.
   * @param settings The connection settings.
   * @param token The authentication token.
   */
  constructor (settings: ConnectionSettings, token: string) {
    this.settings = settings
    this.token = token
  }

  /**
   * Logs a diagnostic message if diagnostics are enabled.
   * @param message The message to log.
   * @param args Additional arguments to log.
   */
  private logDiagnostic (message: string, ...args: any[]): void {
    if (this.settings.enableDiagnostics) {
      logger.info(`[DIAGNOSTICS] ${message}`, ...args)
    }
  }

  /**
   * Streams activities from the Copilot Studio service using eventsource-client.
   * @param url The connection URL for Copilot Studio.
   * @param body Optional. The request body (for POST).
   * @param method Optional. The HTTP method (default: POST).
   * @returns An async generator yielding the Agent's Activities.
   */
  private async * postRequestAsync (url: string, body?: any, method: string = 'POST'): AsyncGenerator<Activity> {
    this.logDiagnostic(`Request URL: ${url}`)
    this.logDiagnostic(`Request Method: ${method}`)
    this.logDiagnostic('Request Body:', body ? JSON.stringify(body, null, 2) : 'none')

    logger.debug(`>>> SEND TO ${url}`)

    const streamMap = new Map<string, { text: string, sequence: number }[]>()

    const eventSource: EventSourceClient = createEventSource({
      url,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': UserAgentHelper.getProductInfo(),
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: body ? JSON.stringify(body) : undefined,
      method,
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        this.processResponseHeaders(response.headers)
        return response
      }
    })

    try {
      for await (const { data, event } of eventSource) {
        if (data && event === 'activity') {
          try {
            const activity = Activity.fromJson(data)

            // check to see if this activity is part of the streamed response, in which case we need to accumulate the text
            const streamingEntity = activity.entities?.find(e => e.type === 'streaminfo' && e.streamType === 'streaming')
            switch (activity.type) {
              case ActivityTypes.Message:
                if (!this.conversationId.trim()) { // Did not get it from the header.
                  this.conversationId = activity.conversation?.id ?? ''
                  logger.debug(`Conversation ID: ${this.conversationId}`)
                }
                yield activity
                break
              case ActivityTypes.Typing:
                logger.debug(`Activity type: ${activity.type}`)
                // Accumulate the text as it comes in from the stream.
                // This also accounts for the "old style" of streaming where the stream info is in channelData.
                if (streamingEntity || activity.channelData?.streamType === 'streaming') {
                  const text = activity.text ?? ''
                  const id = (streamingEntity?.streamId ?? activity.channelData?.streamId)
                  const sequence = (streamingEntity?.streamSequence ?? activity.channelData?.streamSequence)
                  // Accumulate the text chunks based on stream ID and sequence number.
                  if (id && sequence) {
                    if (streamMap.has(id)) {
                      const existing = streamMap.get(id)!
                      existing.push({ text, sequence })
                      streamMap.set(id, existing)
                    } else {
                      streamMap.set(id, [{ text, sequence }])
                    }
                    activity.text = streamMap.get(id)?.sort((a, b) => a.sequence - b.sequence).map(item => item.text).join('') || ''
                  }
                }
                yield activity
                break
              default:
                logger.debug(`Activity type: ${activity.type}`)
                yield activity
                break
            }
          } catch (error) {
            logger.error('Failed to parse activity:', error)
          }
        } else if (event === 'end') {
          logger.debug('Stream complete')
          break
        }

        if (eventSource.readyState === 'closed') {
          logger.debug('Connection closed')
          break
        }
      }
    } finally {
      eventSource.close()
    }
  }

  private processResponseHeaders (responseHeaders: Headers): void {
    if (this.settings.useExperimentalEndpoint && !this.settings.directConnectUrl?.trim()) {
      const islandExperimentalUrl = responseHeaders?.get(CopilotStudioClient.islandExperimentalUrlHeaderKey)
      if (islandExperimentalUrl) {
        this.settings.directConnectUrl = islandExperimentalUrl
        logger.debug(`Island Experimental URL: ${islandExperimentalUrl}`)
      }
    }

    this.conversationId = responseHeaders?.get(CopilotStudioClient.conversationIdHeaderKey) ?? ''
    if (this.conversationId) {
      logger.debug(`Conversation ID: ${this.conversationId}`)
    }

    const sanitizedHeaders = new Headers()
    responseHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== 'authorization' && key.toLowerCase() !== CopilotStudioClient.conversationIdHeaderKey.toLowerCase()) {
        sanitizedHeaders.set(key, value)
      }
    })
    this.logDiagnostic('Response Headers:', sanitizedHeaders)
  }

  /**
   * Starts a new conversation with the Copilot Studio service using a StartRequest.
   * @param request The request parameters for starting the conversation.
   * @returns An async generator yielding the Agent's Activities.
   */
  public startConversationStreaming (request: StartRequest): AsyncGenerator<Activity>

  /**
   * Starts a new conversation with the Copilot Studio service.
   * @param emitStartConversationEvent Whether to emit a start conversation event. Defaults to true.
   * @returns An async generator yielding the Agent's Activities.
   */
  public startConversationStreaming (emitStartConversationEvent?: boolean): AsyncGenerator<Activity>

  /**
   * Implementation of startConversationStreaming with overloads.
   */
  public async * startConversationStreaming (
    requestOrFlag?: StartRequest | boolean
  ): AsyncGenerator<Activity> {
    // Normalize input to StartRequest
    let request: StartRequest

    if (typeof requestOrFlag === 'boolean' || requestOrFlag === undefined) {
      // Legacy call: startConversationStreaming(true/false)
      request = {
        emitStartConversationEvent: requestOrFlag ?? true
      }
    } else {
      // New call: startConversationStreaming({ locale: 'en-US', ... })
      request = requestOrFlag
    }

    const uriStart: string = getCopilotStudioConnectionUrl(this.settings, request.conversationId)
    const body: any = {
      emitStartConversationEvent: request.emitStartConversationEvent ?? true
    }

    // Add locale to body if provided
    if (request.locale) {
      body.locale = request.locale
    }

    logger.info('Starting conversation ...', request)
    this.logDiagnostic('Start conversation request:', body)

    yield * this.postRequestAsync(uriStart, body, 'POST')
  }

  /**
   * Sends an activity to the Copilot Studio service and retrieves the response activities.
   * @param activity The activity to send.
   * @param conversationId The ID of the conversation. Defaults to the current conversation ID.
   * @returns An async generator yielding the Agent's Activities.
   */
  public async * sendActivityStreaming (activity: Activity, conversationId: string = this.conversationId) : AsyncGenerator<Activity> {
    const localConversationId = activity.conversation?.id ?? conversationId
    const uriExecute = getCopilotStudioConnectionUrl(this.settings, localConversationId)
    const qbody: ExecuteTurnRequest = new ExecuteTurnRequest(activity)

    logger.info('Sending activity...', activity)
    yield * this.postRequestAsync(uriExecute, qbody, 'POST')
  }

  /**
   * Executes a turn in an existing conversation by sending an activity.
   * This method provides explicit control over the conversation ID.
   * @param activity The activity to send.
   * @param conversationId The ID of the conversation. Required.
   * @returns An async generator yielding the Agent's Activities.
   * @throws Error if conversationId is not provided.
   */
  public async * executeStreaming (
    activity: Activity,
    conversationId: string
  ): AsyncGenerator<Activity> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('conversationId is required for executeStreaming')
    }

    const uriExecute = getCopilotStudioConnectionUrl(this.settings, conversationId)
    const request: ExecuteTurnRequest = new ExecuteTurnRequest(activity, conversationId)

    logger.info('Executing turn with conversation ID:', conversationId)
    this.logDiagnostic('Execute turn request:', {
      conversationId,
      activityType: activity.type,
      activityText: activity.text
    })

    yield * this.postRequestAsync(uriExecute, request, 'POST')
  }

  /**
   * Executes a turn in an existing conversation by sending an activity.
   * @param activity The activity to send.
   * @param conversationId The ID of the conversation. Required.
   * @returns A promise yielding an array of activities.
   * @throws Error if conversationId is not provided.
   * @deprecated Use executeStreaming instead.
   */
  public async execute (
    activity: Activity,
    conversationId: string
  ): Promise<Activity[]> {
    const result: Activity[] = []
    for await (const value of this.executeStreaming(activity, conversationId)) {
      result.push(value)
    }
    return result
  }

  /**
   * Starts a new conversation with the Copilot Studio service using a StartRequest.
   * @param request The request parameters for starting the conversation.
   * @returns A promise yielding an array of activities.
   * @deprecated Use startConversationStreaming instead.
   */
  public async startConversationAsync (request: StartRequest): Promise<Activity[]>

  /**
   * Starts a new conversation with the Copilot Studio service.
   * @param emitStartConversationEvent Whether to emit a start conversation event. Defaults to true.
   * @returns A promise yielding an array of activities.
   * @deprecated Use startConversationStreaming instead.
   */
  public async startConversationAsync (emitStartConversationEvent?: boolean): Promise<Activity[]>

  /**
   * Implementation of startConversationAsync with overloads.
   */
  public async startConversationAsync (
    requestOrFlag?: StartRequest | boolean
  ): Promise<Activity[]> {
    const result: Activity[] = []
    for await (const value of this.startConversationStreaming(requestOrFlag as any)) {
      result.push(value)
    }
    return result
  }

  /**
   * Sends a question to the Copilot Studio service and retrieves the response activities.
   * @param question The question to ask.
   * @param conversationId The ID of the conversation. Defaults to the current conversation ID.
   * @returns A promise yielding an array of activities.
   * @deprecated Use sendActivityStreaming instead.
   */
  public async askQuestionAsync (question: string, conversationId?: string) : Promise<Activity[]> {
    const localConversationId = conversationId?.trim() ? conversationId : this.conversationId
    const conversationAccount: ConversationAccount = {
      id: localConversationId
    }
    const activityObj = {
      type: 'message',
      text: question,
      conversation: conversationAccount
    }
    const activity = Activity.fromObject(activityObj)

    const result: Activity[] = []
    for await (const value of this.sendActivityStreaming(activity, conversationId)) {
      result.push(value)
    }
    return result
  }

  /**
   * Sends an activity to the Copilot Studio service and retrieves the response activities.
   * @param activity The activity to send.
   * @param conversationId The ID of the conversation. Defaults to the current conversation ID.
   * @returns A promise yielding an array of activities.
   * @deprecated Use sendActivityStreaming instead.
   */
  public async sendActivity (activity: Activity, conversationId: string = this.conversationId) : Promise<Activity[]> {
    const result: Activity[] = []
    for await (const value of this.sendActivityStreaming(activity, conversationId)) {
      result.push(value)
    }
    return result
  }

  /**
   * Starts a new conversation and returns a typed response.
   * @param request The request parameters for starting the conversation.
   * @returns A promise yielding a StartResponse with activities and conversation metadata.
   */
  public async startConversationWithResponse (request?: StartRequest | boolean): Promise<StartResponse> {
    const activities: Activity[] = []
    let finalConversationId = ''

    for await (const activity of this.startConversationStreaming(request as any)) {
      activities.push(activity)
      if (activity.conversation?.id) {
        finalConversationId = activity.conversation.id
      }
    }

    // Fall back to instance conversationId if not found in activities
    finalConversationId = finalConversationId || this.conversationId

    return createStartResponse(activities, finalConversationId)
  }

  /**
   * Executes a turn and returns a typed response.
   * @param activity The activity to send.
   * @param conversationId The conversation ID.
   * @returns A promise yielding an ExecuteTurnResponse with activities and metadata.
   */
  public async executeWithResponse (
    activity: Activity,
    conversationId: string
  ): Promise<ExecuteTurnResponse> {
    const activities: Activity[] = []

    for await (const value of this.executeStreaming(activity, conversationId)) {
      activities.push(value)
    }

    return createExecuteTurnResponse(activities, conversationId)
  }

  /**
   * Subscribes to a conversation to receive events via Server-Sent Events (SSE).
   * This method allows resumption from a specific event ID.
   * @param conversationId The ID of the conversation to subscribe to.
   * @param lastReceivedEventId Optional. The last received event ID for resumption.
   * @returns An async generator yielding SubscribeEvent objects containing activities and event IDs.
   */
  public async * subscribeAsync (
    conversationId: string,
    lastReceivedEventId?: string
  ): AsyncGenerator<SubscribeEvent> {
    if (!conversationId || !conversationId.trim()) {
      throw new Error('conversationId is required for subscribeAsync')
    }

    const url = getCopilotStudioSubscribeUrl(this.settings, conversationId)

    logger.info('Subscribing to conversation:', conversationId)
    this.logDiagnostic('Subscribe request:', { conversationId, lastReceivedEventId, url })

    const eventSource: EventSourceClient = createEventSource({
      url,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'User-Agent': UserAgentHelper.getProductInfo(),
        Accept: 'text/event-stream',
        ...(lastReceivedEventId && { 'Last-Event-ID': lastReceivedEventId })
      },
      method: 'GET',
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        this.processResponseHeaders(response.headers)
        return response
      }
    })

    try {
      for await (const { data, event, id } of eventSource) {
        if (data && event === 'activity') {
          try {
            const activity = Activity.fromJson(data)
            const subscribeEvent: SubscribeEvent = {
              activity,
              eventId: id
            }

            logger.debug(`Received activity via subscription, event ID: ${id}`)
            this.logDiagnostic('Subscribe event received:', { eventId: id, activityType: activity.type })

            yield subscribeEvent
          } catch (error) {
            logger.error('Failed to parse activity in subscription:', error)
          }
        } else if (event === 'end') {
          logger.debug('Subscription stream complete')
          break
        }

        if (eventSource.readyState === 'closed') {
          logger.debug('Subscription connection closed')
          break
        }
      }
    } finally {
      eventSource.close()
    }
  }
}
