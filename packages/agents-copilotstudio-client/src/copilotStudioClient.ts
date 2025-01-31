/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionSettings } from './connectionSettings'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { getCopilotStudioConnectionUrl } from './powerPlatformEnvironment'
import { Activity, ConversationAccount } from '@microsoft/agents-activity-schema'
import { ExecuteTurnRequest } from './executeTurnRequest'
import createDebug, { Debugger } from 'debug'

export class CopilotStudioClient {
  private conversationId: string = ''
  private readonly settings: ConnectionSettings
  private readonly client: AxiosInstance
  private readonly logger: Debugger
  constructor (settings: ConnectionSettings, token: string) {
    this.settings = settings
    this.client = axios.create()
    this.client.defaults.headers.common.Authorization = `Bearer ${token}`
    this.logger = createDebug('copilot-studio-client')
  }

  private async postRequestAsync (axiosConfig: AxiosRequestConfig): Promise<Activity[]> {
    const activities: Activity[] = []
    const response = await this.client(axiosConfig)
    const stream = response.data
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        this.logger('Stream complete')
        break
      }
      this.logger(value)
      const values: string[] = value.toString().split('\n')
      const event = values[0]
      const data = values[1]
      const eventType = event.split(' ')[1].replace(/\r/g, '')
      if (eventType === 'activity') {
        const actobj = JSON.parse(data.substring(5, data.length))
        if (actobj.type === 'message') {
          const validTimestamp = new Date(actobj.timestamp)
          actobj.timestamp = validTimestamp.toISOString()
          const act = Activity.fromObject(actobj)
          this.conversationId = act.conversation!.id
          activities.push(act)
        }
        if (actobj.type === 'typing') {
          this.logger('Bot is typing...')
        }
      }
    }
    return activities
  }

  public async startConversationAsync (emitStartConversationEvent: boolean = true): Promise<Activity[]> {
    const uriStart: string = getCopilotStudioConnectionUrl(this.settings)
    const body = { emitStartConversationEvent }

    const config: AxiosRequestConfig = {
      method: 'post',
      url: uriStart,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json'
      },
      data: body,
      responseType: 'stream',
      adapter: 'fetch'
    }

    const values = await this.postRequestAsync(config)

    return values
  }

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
        'Content-Type': 'application/json'
      },
      data: qbody,
      responseType: 'stream',
      adapter: 'fetch'
    }
    const values = await this.postRequestAsync(config)
    return values
  }
}
