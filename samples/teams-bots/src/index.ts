// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'
import rateLimit from 'express-rate-limit'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, /* MemoryStorage, ConversationState, UserState */ } from '@microsoft/agents-bot-hosting'
import { ConversationReference } from '@microsoft/agents-bot-activity'

import { TeamsJsBot } from './teamsJsBot'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const conversationReferences: { [key: string]: ConversationReference } = {}

const createBot = (botName: string) => {
  switch (botName) {
    case 'TeamsJsBot':
      return new TeamsJsBot()
    default:
      throw new Error(`Bot with name ${botName} is not recognized.`)
  }
}

const adapter = new CloudAdapter(authConfig)

const botName = process.env.botName || 'MultiFeatureBot'
const myBot = createBot(botName)

const app = express()

app.use(rateLimit({ validate: { xForwardedForHeader: false } }))
app.use(express.json())
app.use(authorizeJWT(authConfig))

app.get('/api/notify', async (_req: Request, res: Response) => {
  for (const conversationReference of Object.values(conversationReferences)) {
    await adapter.continueConversation(conversationReference, async context => {
      await context.sendActivity('proactive hello')
    })
  }

  res.setHeader('Content-Type', 'text/html')
  res.writeHead(200)
  res.write('<html><body><h1>Proactive messages have been sent.</h1></body></html>')
  res.end()
})

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
