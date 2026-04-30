/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../../turnContext'
import { InvokeResponse } from '../../invoke'
import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'

/**
 * Sends an InvokeResponse activity if the channel is Microsoft Teams, including Copilot within MS Teams.
 */
export function sendInvokeResponse<T> (context: TurnContext, response: InvokeResponse<T>) {
  if (context.activity.channelIdChannel !== Channels.Msteams) {
    return Promise.resolve()
  }

  return context.sendActivity(Activity.fromObject({
    type: ActivityTypes.InvokeResponse,
    value: response
  }))
}
