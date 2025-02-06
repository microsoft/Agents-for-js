// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import rateLimit from 'express-rate-limit'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-bot-hosting'
import { AdaptiveCardBot } from './01.adaptiveCardsBot'
import { CardFactoryBot } from './02.cardFactoryBot'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const createBot = (botName: string) => {
  switch (botName) {
    case 'AdaptiveCardBot':
      return new AdaptiveCardBot()
    case 'CardFactoryBot':
      return new CardFactoryBot()
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

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
