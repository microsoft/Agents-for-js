// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityHandler, ActivityTypes, EndOfConversationCodes, MessageFactory } from '@microsoft/agents-bot-hosting'

export class EchoBot extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      if (context.activity.text!.includes('end') || context.activity.text!.includes('stop')) {
        const messageText = 'echo-bot: Ending conversation...'
        await context.sendActivity(MessageFactory.text(messageText, messageText))
        await context.sendActivity(Activity.fromObject(
          {
            type: ActivityTypes.EndOfConversation,
            code: EndOfConversationCodes.CompletedSuccessfully
          }
        ))
      } else {
        const replyText = `echo-bot: ${context.activity.text}`
        await context.sendActivity(MessageFactory.text(replyText, replyText))
      }
      await next()
    })
  }
}
