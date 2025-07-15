/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionSettings } from './connectionSettings'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { getCopilotStudioConnectionUrl, getTokenAudience } from './powerPlatformEnvironment'
import { Activity, ActivityTypes, ConversationAccount } from '@microsoft/agents-activity'
import { ExecuteTurnRequest } from './executeTurnRequest'
import { debug } from '@microsoft/agents-activity/logger'
import { version } from '../package.json'
import os from 'os'

const logger = debug('copilot-studio:client')

interface streamRead {
  done: boolean,
  value: string
}

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
  /** The Axios instance used for HTTP requests. */
  private readonly client: AxiosInstance

  /**
   * Returns the scope URL needed to connect to Copilot Studio from the connection settings.
   * This is used for authentication token audience configuration.
   * @param settings Copilot Studio connection settings.
   * @returns The scope URL for token audience.
   */
  static scopeFromSettings: (settings: ConnectionSettings) => string = getTokenAudience

  /**
   * Creates an instance of CopilotStudioClient.
   * @param settings The connection settings.
   * @param token The authentication token.
   */
  constructor (settings: ConnectionSettings, token: string) {
    this.settings = settings
    this.client = axios.create()
    this.client.defaults.headers.common.Authorization = `Bearer ${token}`
    this.client.defaults.headers.common['User-Agent'] = CopilotStudioClient.getProductInfo()
  }

  private async postRequestAsync (axiosConfig: AxiosRequestConfig): Promise<Activity[]> {
    const activities: Activity[] = []

    logger.debug(`>>> SEND TO ${axiosConfig.url}`)

    const response = await this.client(axiosConfig)

    if (this.settings.useExperimentalEndpoint && !this.settings.directConnectUrl?.trim()) {
      const islandExperimentalUrl = response.headers?.[CopilotStudioClient.islandExperimentalUrlHeaderKey]
      if (islandExperimentalUrl) {
        this.settings.directConnectUrl = islandExperimentalUrl
        logger.debug(`Island Experimental URL: ${islandExperimentalUrl}`)
      }
    }

    this.conversationId = response.headers?.[CopilotStudioClient.conversationIdHeaderKey] ?? ''
    if (this.conversationId) {
      logger.debug(`Conversation ID: ${this.conversationId}`)
    }

    const sanitizedHeaders = { ...response.headers }
    delete sanitizedHeaders['Authorization']
    delete sanitizedHeaders[CopilotStudioClient.conversationIdHeaderKey]
    logger.debug('Headers received:', sanitizedHeaders)

    const stream = response.data
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
    let result: string = ''
    const results: string[] = []

    const processEvents = async ({ done, value }: streamRead): Promise<string[]> => {
      if (done) {
        logger.debug('Stream complete')
        result += value
        results.push(result)
        return results
      }
      logger.info('Agent is typing ...')
      result += value

      return await processEvents(await reader.read())
    }

    const events: string[] = await reader.read().then(processEvents)

    events.forEach(event => {
      const values: string[] = event.toString().split('\n')
      const validEvents = values.filter(e => e.substring(0, 4) === 'data' && e !== 'data: end\r')
      validEvents.forEach(ve => {
        try {
          const act = Activity.fromJson(ve.substring(5, ve.length))
          if (act.type === ActivityTypes.Message) {
            activities.push(act)
            if (!this.conversationId.trim()) {
              // Did not get it from the header.
              this.conversationId = act.conversation?.id ?? ''
              logger.debug(`Conversation ID: ${this.conversationId}`)
            }
          } else {
            logger.debug(`Activity type: ${act.type}`)
          }
        } catch (e) {
          logger.error('Error: ', e)
          throw e
        }
      })
    })
    return activities
  }

  /**
   * Appends this package.json version to the User-Agent header.
   * - For browser environments, it includes the user agent of the browser.
   * - For Node.js environments, it includes the Node.js version, platform, architecture, and release.
   * @returns A string containing the product information, including version and user agent.
   */
  private static getProductInfo (): string {
    const versionString = `CopilotStudioClient.agents-sdk-js/${version}`
    let userAgent: string

    if (typeof window !== 'undefined' && window.navigator) {
      userAgent = `${versionString} ${navigator.userAgent}`
    } else {
      userAgent = `${versionString} nodejs/${process.version} ${os.platform()}-${os.arch()}/${os.release()}`
    }

    logger.debug(`User-Agent: ${userAgent}`)
    return userAgent
  }

  /**
   * Starts a new conversation with the Copilot Studio service.
   * @param emitStartConversationEvent Whether to emit a start conversation event. Defaults to true.
   * @returns A promise that resolves to the initial activity of the conversation.
   */
  public async startConversationAsync (emitStartConversationEvent: boolean = true): Promise<Activity> {
    const uriStart: string = getCopilotStudioConnectionUrl(this.settings)
    const body = { emitStartConversationEvent }

    const config: AxiosRequestConfig = {
      method: 'post',
      url: uriStart,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      data: body,
      responseType: 'stream',
      adapter: 'fetch'
    }

    logger.info('Starting conversation ...')
    const values = await this.postRequestAsync(config)
    const act = values[0]
    logger.info(`Conversation '${act.conversation?.id}' started. Received ${values.length} activities.`, values)
    return act
  }

  /**
   * Sends a question to the Copilot Studio service and retrieves the response activities.
   * @param question The question to ask.
   * @param conversationId The ID of the conversation. Defaults to the current conversation ID.
   * @returns A promise that resolves to an array of activities containing the responses.
   */
  public async askQuestionAsync (question: string, conversationId: string = this.conversationId) {
    const conversationAccount: ConversationAccount = {
      id: conversationId
    }
    const activityObj = {
      type: 'message',
      text: question,
      conversation: conversationAccount
    }
    const activity = Activity.fromObject(activityObj)

    const localConversationId = activity.conversation?.id ?? conversationId
    const uriExecute = getCopilotStudioConnectionUrl(this.settings, localConversationId)
    const qbody: ExecuteTurnRequest = new ExecuteTurnRequest(activity)

    const config: AxiosRequestConfig = {
      method: 'post',
      url: uriExecute,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      data: qbody,
      responseType: 'stream',
      adapter: 'fetch'
    }
    logger.info(`Asking question: ${question} ...`)
    const values = await this.postRequestAsync(config)
    logger.info(`Received ${values.length} activities.`, values)
    return values
  }
}
