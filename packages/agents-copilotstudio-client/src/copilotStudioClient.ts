/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEventSource, EventSourceClient, EventSourceOptions } from 'eventsource-client'
import { ConnectionSettings } from './connectionSettings'
import { getCopilotStudioConnectionUrl, getCopilotStudioSubscribeUrl } from './powerPlatformEnvironment'
import { Activity, ActivityTypes, ConversationAccount, ExceptionHelper } from '@microsoft/agents-activity'
import { ExecuteTurnRequest } from './executeTurnRequest'
import { debug, pseudonymizeConversationId, redactString, redactUrl, redactDiagnosticObject, trace } from '@microsoft/agents-telemetry'
import { UserAgentHelper } from './userAgentHelper'
import { ScopeHelper } from './scopeHelper'
import { StartRequest } from './startRequest'
import { StartResponse, ExecuteTurnResponse, createStartResponse, createExecuteTurnResponse } from './responses'
import { SubscribeEvent } from './subscribeEvent'
import { CopilotStudioClientTraceDefinitions } from './observability'
import { Errors } from './errorHelper'
import { AgentType } from './agentType'
import { ConversationEndpoints, ConversationOperation, discoverConversationEndpoints, getConversationEndpointsDiscoveryUrl } from './conversationEndpointDiscovery'

const logger = debug('copilot-studio:client')

interface RequestConversation {
  id: string
  updateLegacyDefault: boolean
}

/**
 * Client for interacting with Microsoft Copilot Studio services.
 * Provides functionality to start conversations and send messages to Copilot Studio bots.
 * @remarks For concurrent reuse, obtain request-local start metadata and pass IDs explicitly.
 * Implicit routing uses a client-scoped mutable legacy default and is not safe for concurrent conversations.
 */
export class CopilotStudioClient {
  /** Header key for conversation ID. */
  private static readonly conversationIdHeaderKey: string = 'x-ms-conversationid'
  /** Island Header key */
  private static readonly islandExperimentalUrlHeaderKey: string = 'x-ms-d2e-experimental'

  /** Legacy default for implicit sends; never used to identify a start response. */
  private conversationId: string = ''
  /** The connection settings for the client. */
  private readonly settings: ConnectionSettings
  /** The authenticaton token. */
  private readonly token: string
  private discoveryPromise?: Promise<void>
  private discoveredDirectConnectUrl?: string
  private discoveredEndpoints?: ConversationEndpoints

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
   * Returns the diagnostics pseudonym key from the connection settings.
   */
  get diagnosticsPseudonymKey (): string {
    return this.settings.diagnosticsPseudonymKey ?? ''
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

  private async resolveConnectionUrl (conversationId?: string, subscribe: boolean = false): Promise<string> {
    const configuredUrl = (): string => subscribe
      ? getCopilotStudioSubscribeUrl(this.settings, conversationId!)
      : getCopilotStudioConnectionUrl(this.settings, conversationId)

    if (this.settings.copilotAgentType === AgentType.Prebuilt) {
      return configuredUrl()
    }
    if (this.settings.directConnectUrl?.trim()) {
      if (this.discoveredEndpoints && this.settings.directConnectUrl === this.discoveredDirectConnectUrl) {
        const operation: ConversationOperation = subscribe ? 'subscribe' : conversationId ? 'executeTurn' : 'createConversation'
        return this.discoveredEndpoints.getUrl(operation, conversationId)
      }
      return configuredUrl()
    }

    if (!this.discoveryPromise) {
      this.discoveryPromise = this.discoverConnectionUrl().finally(() => {
        this.discoveryPromise = undefined
      })
    }
    await this.discoveryPromise
    return this.resolveConnectionUrl(conversationId, subscribe)
  }

  private async discoverConnectionUrl (): Promise<void> {
    const discoveryUrl = getConversationEndpointsDiscoveryUrl(this.settings)
    const endpoints = await discoverConversationEndpoints(discoveryUrl, (url, init) => this.sendRequestAsync(url, init), this.token)
    if (!this.settings.directConnectUrl?.trim() && this.settings.copilotAgentType !== AgentType.Prebuilt) {
      this.discoveredEndpoints = endpoints
      this.discoveredDirectConnectUrl = endpoints.createConversation
      this.settings.directConnectUrl = endpoints.createConversation
    }
  }

  private async sendRequestAsync (url: string | URL | Request, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, init)
    const error = CopilotStudioClient.getFailedResponseError(response)
    if (error) {
      throw error
    }
    return response
  }

  /**
   * Streams activities from the Copilot Studio service using eventsource-client.
   * @param url The connection URL for Copilot Studio.
   * @param body Optional. The request body (for POST).
   * @param method Optional. The HTTP method (default: POST).
   * @returns An async generator yielding the Agent's Activities.
   */
  private async * postRequestAsync (
    url: string,
    body?: any,
    method: string = 'POST',
    conversation: RequestConversation = { id: '', updateLegacyDefault: true }
  ): AsyncGenerator<Activity> {
    const managed = trace(CopilotStudioClientTraceDefinitions.postRequest)
    const redactedUrl = redactUrl(url) ?? ''
    managed.record({ url: redactedUrl, method })

    try {
      this.logDiagnostic(`Request URL: ${redactedUrl}`)
      this.logDiagnostic(`Request Method: ${method}`)
      this.logDiagnostic('Request Body:', body ? JSON.stringify(redactDiagnosticObject(body, this.settings.diagnosticsPseudonymKey), null, 2) : 'none')

      logger.debug(`>>> SEND TO ${redactedUrl}`)

      const streamMap = new Map<string, { text: string, sequence: number }[]>()
      let requestError: Error | undefined
      const eventSourceRef: { current?: EventSourceClient } = {}
      const responseHandlers = this.createEventSourceResponseHandlers(
        () => eventSourceRef.current,
        (error) => { requestError = error },
        conversation
      )

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
        ...responseHandlers
      })
      eventSourceRef.current = eventSource

      try {
        for await (const { data, event } of eventSource) {
          if (data && event === 'activity') {
            try {
              const activity = Activity.fromJson(data)
              if (!conversation.id.trim() && activity.conversation?.id?.trim()) {
                conversation.id = activity.conversation.id
              }
              managed.actions.receivedFromCopilot(activity.type, pseudonymizeConversationId(activity.conversation?.id, this.settings.diagnosticsPseudonymKey))

              // check to see if this activity is part of the streamed response, in which case we need to accumulate the text
              const streamingEntity = activity.entities?.find(e => e.type === 'streaminfo' && e.streamType === 'streaming')
              switch (activity.type) {
                case ActivityTypes.Message:
                  if (conversation.updateLegacyDefault && !this.conversationId.trim()) { // Legacy implicit routing only.
                    this.conversationId = activity.conversation?.id ?? ''
                    logger.debug(`Conversation ID: ${pseudonymizeConversationId(this.conversationId, this.settings.diagnosticsPseudonymKey)}`)
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

        if (requestError) {
          throw requestError
        }
      } finally {
        eventSource.close()
      }
    } catch (error) {
      throw managed.fail(error)
    } finally {
      managed.end()
    }
  }

  private processResponseHeaders (responseHeaders: Headers, conversation?: RequestConversation): void {
    if (this.settings.useExperimentalEndpoint && !this.settings.directConnectUrl?.trim()) {
      const islandExperimentalUrl = responseHeaders?.get(CopilotStudioClient.islandExperimentalUrlHeaderKey)
      if (islandExperimentalUrl) {
        this.settings.directConnectUrl = islandExperimentalUrl
        logger.debug(`Island Experimental URL: ${redactUrl(islandExperimentalUrl)}`)
      }
    }

    const conversationId = responseHeaders?.get(CopilotStudioClient.conversationIdHeaderKey)
    if (conversationId) {
      if (conversation) {
        conversation.id = conversationId
      }
      if (!conversation || conversation.updateLegacyDefault) {
        this.conversationId = conversationId
      }
      logger.debug(`Conversation ID: ${pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey)}`)
    }

    const sanitizedHeaders = new Headers()
    responseHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== 'authorization' && key.toLowerCase() !== CopilotStudioClient.conversationIdHeaderKey.toLowerCase()) {
        sanitizedHeaders.set(key, value)
      }
    })
    this.logDiagnostic('Response Headers:', sanitizedHeaders)
  }

  private createEventSourceResponseHandlers (
    getEventSource: () => EventSourceClient | undefined,
    setRequestError: (error: Error) => void,
    conversation?: RequestConversation
  ): Pick<EventSourceOptions, 'onScheduleReconnect' | 'fetch'> {
    let hasFailedResponse = false

    return {
      onScheduleReconnect: () => {
        if (hasFailedResponse) {
          getEventSource()?.close()
        }
      },
      fetch: async (url, init) => {
        const response = await fetch(url, init)
        const failedResponseError = CopilotStudioClient.getFailedResponseError(response)
        if (failedResponseError) {
          hasFailedResponse = true
          setRequestError(failedResponseError)
          throw failedResponseError
        }
        this.processResponseHeaders(response.headers, conversation)
        return response
      }
    }
  }

  private static getFailedResponseError (response: Response): Error | undefined {
    if (response.ok) {
      return undefined
    }

    const statusText = CopilotStudioClient.sanitizeStatusText(response.statusText)
    const status = statusText ? `${response.status} ${statusText}` : `${response.status}`
    return ExceptionHelper.generateException(Error, Errors.CopilotStudioRequestFailed, undefined, { status })
  }

  private static sanitizeStatusText (statusText?: string): string {
    return statusText?.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) ?? ''
  }

  /**
   * Starts a new conversation with the Copilot Studio service using a StartRequest.
   * @param request The request parameters for starting the conversation.
   * @returns An async generator yielding the Agent's Activities.
   * @remarks Use a metadata-returning start method when the conversation ID is needed independently of activities.
   * Overrides must forward the generator return value with `return yield *` to preserve
   * header-only conversation metadata. An override returning no metadata or activity ID
   * produces an empty conversation ID; the shared implicit default is never borrowed.
   */
  public startConversationStreaming (request: StartRequest): AsyncGenerator<Activity>

  /**
   * Starts a new conversation with the Copilot Studio service.
   * @param emitStartConversationEvent Whether to emit a start conversation event. Defaults to true.
   * @returns An async generator yielding the Agent's Activities.
   * @remarks Use a metadata-returning start method when the conversation ID is needed independently of activities.
   * Overrides must forward the generator return value with `return yield *` to preserve
   * header-only conversation metadata. An override returning no metadata or activity ID
   * produces an empty conversation ID; the shared implicit default is never borrowed.
   */
  public startConversationStreaming (emitStartConversationEvent?: boolean): AsyncGenerator<Activity>

  /**
   * Implementation of startConversationStreaming with overloads.
   */
  public async * startConversationStreaming (
    requestOrFlag?: StartRequest | boolean
  ): AsyncGenerator<Activity> {
    return yield * this.startConversationCore(requestOrFlag, true)
  }

  private async * startConversationCore (
    requestOrFlag: StartRequest | boolean | undefined,
    updateLegacyDefault: boolean
  ): AsyncGenerator<Activity, string> {
    const managed = trace(CopilotStudioClientTraceDefinitions.startConversation)
    try {
      // Normalize input to StartRequest
      let request: StartRequest

      if (typeof requestOrFlag === 'boolean' || requestOrFlag === undefined) {
        // Legacy call: startConversationStreaming(true/false)
        managed.record({ shouldEmitStartEvent: requestOrFlag ?? true })
        request = {
          emitStartConversationEvent: requestOrFlag ?? true
        }
      } else {
        // New call: startConversationStreaming({ locale: 'en-US', ... })
        request = requestOrFlag
        managed.record({ shouldEmitStartEvent: request.emitStartConversationEvent ?? true })
      }

      // Keep response metadata local. Only legacy starts reset the implicit default.
      const conversation: RequestConversation = { id: '', updateLegacyDefault }
      if (updateLegacyDefault) {
        this.conversationId = request.conversationId ?? ''
      }

      const uriStart = await this.resolveConnectionUrl(request.conversationId)
      const body: any = {
        emitStartConversationEvent: request.emitStartConversationEvent ?? true
      }

      // Add locale to body if provided
      if (request.locale) {
        body.locale = request.locale
      }

      logger.info('Starting conversation ...', redactDiagnosticObject(request, this.settings.diagnosticsPseudonymKey))
      this.logDiagnostic('Start conversation request:', redactDiagnosticObject(body, this.settings.diagnosticsPseudonymKey))

      yield * this.postRequestAsync(uriStart, body, 'POST', conversation)
      return conversation.id || request.conversationId || ''
    } catch (error) {
      throw managed.fail(error)
    } finally {
      managed.end()
    }
  }

  /**
   * Sends an activity to the Copilot Studio service and retrieves the response activities.
   * @param activity The activity to send.
   * @param conversationId The ID of the conversation. Defaults to the current conversation ID.
   * @returns An async generator yielding the Agent's Activities.
   * @remarks An ID on the activity takes precedence over the argument. For shared clients,
   * provide an ID on the activity or as an argument; implicit defaults are conversation-scoped.
   */
  public async * sendActivityStreaming (activity: Activity, conversationId: string = this.conversationId) : AsyncGenerator<Activity> {
    const managed = trace(CopilotStudioClientTraceDefinitions.sendActivity)
    managed.record({
      activityType: activity.type,
      conversationId: pseudonymizeConversationId(activity.conversation?.id ?? conversationId, this.settings.diagnosticsPseudonymKey)
    })
    try {
      const localConversationId = activity.conversation?.id ?? conversationId
      const uriExecute = await this.resolveConnectionUrl(localConversationId)
      const qbody: ExecuteTurnRequest = new ExecuteTurnRequest(activity)

      logger.info('Sending activity...', redactDiagnosticObject(activity, this.settings.diagnosticsPseudonymKey))
      yield * this.postRequestAsync(uriExecute, qbody, 'POST', {
        id: localConversationId,
        updateLegacyDefault: true
      })
    } catch (error) {
      throw managed.fail(error)
    } finally {
      managed.end()
    }
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
    const managed = trace(CopilotStudioClientTraceDefinitions.executeStreaming)
    managed.record({
      activityType: activity.type,
      conversationId: pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey)
    })
    try {
      if (!conversationId || !conversationId.trim()) {
        throw ExceptionHelper.generateException(Error, Errors.ExecuteStreamingConversationIdRequired)
      }

      // Explicit execution changes the current conversation used by subsequent calls.
      this.conversationId = conversationId

      const uriExecute = await this.resolveConnectionUrl(conversationId)
      const request: ExecuteTurnRequest = new ExecuteTurnRequest(activity, conversationId)

      logger.info('Executing turn with conversation ID:', pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey))
      this.logDiagnostic('Execute turn request:', {
        conversationId: pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey),
        activityType: activity.type,
        activityText: redactString(activity.text)
      })

      yield * this.postRequestAsync(uriExecute, request, 'POST')
    } catch (error) {
      throw managed.fail(error)
    } finally {
      managed.end()
    }
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
    let activityConversationId = ''
    const stream = this.startConversationStreaming(request as any)
    try {
      let result = await stream.next()
      while (!result.done) {
        activities.push(result.value)
        activityConversationId = result.value.conversation?.id || activityConversationId
        result = await stream.next()
      }
      // Preserve activity-ID precedence and implicit-default updates for existing callers.
      // Header fallback is request-local; a missing ID still returns an empty string.
      // Overrides must forward metadata explicitly; the shared default belongs to no request.
      const responseId = typeof result.value === 'string' ? result.value : ''
      return createStartResponse(activities, activityConversationId || responseId)
    } finally {
      await stream.return(undefined)
    }
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
    const managed = trace(CopilotStudioClientTraceDefinitions.subscribeAsync)
    managed.record({ conversationId: pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey), lastReceivedEventId })
    try {
      if (!conversationId || !conversationId.trim()) {
        throw ExceptionHelper.generateException(Error, Errors.SubscribeAsyncConversationIdRequired)
      }

      const url = await this.resolveConnectionUrl(conversationId, true)

      logger.info('Subscribing to conversation:', pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey))
      this.logDiagnostic('Subscribe request:', { conversationId: pseudonymizeConversationId(conversationId, this.settings.diagnosticsPseudonymKey), lastReceivedEventId, url: redactUrl(url) })

      let requestError: Error | undefined
      const eventSourceRef: { current?: EventSourceClient } = {}
      const responseHandlers = this.createEventSourceResponseHandlers(
        () => eventSourceRef.current,
        (error) => { requestError = error }
      )

      const eventSource: EventSourceClient = createEventSource({
        url,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'User-Agent': UserAgentHelper.getProductInfo(),
          Accept: 'text/event-stream',
          ...(lastReceivedEventId && { 'Last-Event-ID': lastReceivedEventId })
        },
        method: 'GET',
        ...responseHandlers
      })
      eventSourceRef.current = eventSource

      try {
        for await (const { data, event, id } of eventSource) {
          if (data && event === 'activity') {
            try {
              const activity = Activity.fromJson(data)
              const subscribeEvent: SubscribeEvent = {
                activity,
                eventId: id
              }
              managed.actions.eventReceivedFromCopilot(id, activity.type)

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

        if (requestError) {
          throw requestError
        }
      } finally {
        eventSource.close()
      }
    } catch (error) {
      throw managed.fail(error)
    } finally {
      managed.end()
    }
  }
}
