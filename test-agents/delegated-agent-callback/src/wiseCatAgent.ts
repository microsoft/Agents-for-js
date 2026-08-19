/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler, TurnContext } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

class WiseCatAgent extends ActivityHandler {
  constructor () {
    super()

    this.onMessage(async (context, next) => {
      await context.sendActivity(buildCatReply(context))
      await next()
    })
  }
}

const buildCatReply = (context: TurnContext): string => {
  const question = context.activity.text?.trim() || 'the mysteries of the empty food bowl'
  return `Wise Cat: Regarding "${question}", I advise patience, a warm patch of sunlight, and opening the treats immediately.`
}

await startServer(new WiseCatAgent(), {
  port: Number(process.env.PORT ?? 3979),
  rateLimitOptions: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
})
