// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes, EndOfConversationCodes } from '@microsoft/agents-activity'
import { ActivityHandler, MessageFactory } from '@microsoft/agents-hosting'

export class EmptyAgent extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      if (context.activity.text!.includes('end') || context.activity.text!.includes('stop')) {
        const messageText = 'agent: Ending conversation...'
        await context.sendActivity(MessageFactory.text(messageText, messageText))
        await context.sendActivity(Activity.fromObject(
          {
            type: ActivityTypes.EndOfConversation,
            code: EndOfConversationCodes.CompletedSuccessfully
          }
        ))
      } else {
        const replyText = `empty-agent: ${context.activity.text}`
        await context.sendActivity(MessageFactory.text(replyText, replyText))
        const actWithRT = new Activity(ActivityTypes.Message)
        actWithRT.relatesTo = context.activity.getConversationReference()
        actWithRT.text = 'empty-agent: This is a reply with relatesTo'
        await context.sendActivity(actWithRT)
      }
      await next()
    })
  }
}
