/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import express, { Response } from 'express'
import rateLimit from 'express-rate-limit'
import {
  ActivityHandler,
  AgentClient,
  AuthConfiguration,
  CloudAdapter,
  configureResponseController,
  ConversationState,
  loadAuthConfigFromEnv,
  MemoryStorage,
  Request
} from '@microsoft/agents-hosting'

class AskMyCatAgent extends ActivityHandler {
  constructor (
    private readonly authConfig: AuthConfiguration,
    private readonly conversationState: ConversationState
  ) {
    super()

    this.onMessage(async (context, next) => {
      await context.sendActivity("I'll ask my cat. She has strong opinions and excellent whiskers.")

      const catClient = new AgentClient('WiseCat')
      await catClient.postActivity(context.activity, this.authConfig, this.conversationState, context)
      await next()
    })

    this.onEndOfConversation(async (context, next) => {
      console.log(`The Wise Cat ended the delegated conversation: ${context.activity.text ?? 'no final message'}`)
      await next()
    })
  }
}

const authConfig = loadAuthConfigFromEnv()
const conversationState = new ConversationState(new MemoryStorage())
const adapter = new CloudAdapter(authConfig)
const authorizeRequest = adapter.authorizeRequest.bind(adapter)
const agent = new AskMyCatAgent(authConfig, conversationState)
const app = express()
const requestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
})

app.use(express.json())
app.post('/api/messages', requestRateLimiter, authorizeRequest, async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await agent.run(context))
})
app.use('/api/agentresponse', requestRateLimiter)
// The response controller applies the same adapter-owned authorization internally.
configureResponseController(app, adapter, agent, conversationState)

const port = Number(process.env.PORT ?? 3978)
app.listen(port, () => {
  console.log(`I'll Ask My Cat agent listening on http://localhost:${port}/api/messages`)
})
