/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from 'crypto'

import { Activity, ConversationAccount } from '@microsoft/agents-activity'
import { Observable, BehaviorSubject, type Observer } from 'rxjs'

import { CopilotStudioClient } from './copilotStudioClient'

interface CopilotStudioWebChatConnectionSettings {
  showTyping?: boolean;
}

export const CopilotStudioWebChat = {
  createConnection (
    client: CopilotStudioClient,
    settings?: CopilotStudioWebChatConnectionSettings
  ) {
    let sequence = 0
    let activityObserver: Observer<Partial<Activity>> | undefined
    let conversation: ConversationAccount | undefined

    const connectionStatus$ = new BehaviorSubject(0)
    const activity$ = Observable.create(
      async (observer: Observer<Partial<Activity>>) => {
        activityObserver = observer

        if (connectionStatus$.value < 2) {
          connectionStatus$.next(2)
          return
        }

        notifyTyping()
        const activity = await client.startConversationAsync()
        conversation = activity.conversation
        sequence = 0
        notifyActivity(activity)
      }
    )

    const notifyActivity = (activity: Partial<Activity>) => {
      activityObserver?.next({
        ...activity,
        timestamp: new Date().toISOString(),
        channelData: {
          ...activity.channelData,
          'webchat:sequence-id': sequence++,
        },
      })
    }

    const notifyTyping = () => {
      if (!settings?.showTyping) {
        return
      }

      const from = conversation
        ? { id: conversation.id, name: conversation.name }
        : { id: 'agent', name: 'Agent' }
      notifyActivity({ type: 'typing', from })
    }

    return {
      connectionStatus$,
      activity$,
      postActivity (activity: Activity) {
        if (!activity.text?.trim()) {
          throw new Error('Activity text cannot be empty.')
        }

        if (!activityObserver) {
          throw new Error('Activity observer is not initialized.')
        }

        return Observable.create(async (observer: Observer<string>) => {
          try {
            const id = crypto.randomUUID()

            notifyActivity({ ...activity, id })
            notifyTyping()

            const activities = await client.askQuestionAsync(activity.text!)
            for (const reponseActivity of activities) {
              notifyActivity(reponseActivity)
            }

            observer.next(id)
            observer.complete()
          } catch (error) {
            observer.error(error)
          }
        })
      },

      end () {
        connectionStatus$.complete()
        activity$.complete()
        if (activityObserver) {
          activityObserver.complete()
          activityObserver = undefined
        }
      },
    }
  },
}
