// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, MessageFactory } from '@microsoft/agents-bot-hosting'

export class EchoBot extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const replyText = `echo-bot: ${context.activity.text}`
      await context.sendActivity(MessageFactory.text(replyText, replyText))
      await next()
    })
  }
}
