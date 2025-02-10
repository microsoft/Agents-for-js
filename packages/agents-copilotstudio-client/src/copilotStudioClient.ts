/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionSettings } from './connectionSettings'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { getCopilotStudioConnectionUrl } from './powerPlatformEnvironment'
import { Activity, ActivityTypes, ConversationAccount } from '@microsoft/agents-activity-schema'
import { ExecuteTurnRequest } from './executeTurnRequest'
import createDebug, { Debugger } from 'debug'

interface streamRead {
  done: boolean,
  value: string
}

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
    let result: string = ''
    const results: string[] = []

    const processEvents = async ({ done, value }: streamRead): Promise<string[]> => {
      if (done) {
        this.logger('Stream complete')
        result += value
        results.push(result)
        return results
      }
      this.logger('Bot is typing...')
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
          } else {
            this.logger('Activity type: ', act.type)
          }
        } catch (e) {
          this.logger('Error: ', e)
          throw e
        }
      })
    })
    return activities
  }

  public async startConversationAsync (emitStartConversationEvent: boolean = true): Promise<Activity> {
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
    const act = values[0]
    this.conversationId = act.conversation?.id!
    return act
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
