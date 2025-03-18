// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'
import { RootBot } from './bot'
import { handleBotResponse } from './controllers/botResponseController'
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)

const myBot = new RootBot()

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

app.post('/api/botresponse/v3/conversations/:conversationId/activities/:activityId', handleBotResponse(adapter, myBot))

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nRootBot to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
