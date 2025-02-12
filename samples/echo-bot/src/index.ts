// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import rateLimit from 'express-rate-limit'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, loadBotAuthConfigFromEnv } from '@microsoft/agents-bot-hosting'
import { EchoBot } from './bot'

const authConfig: AuthConfiguration = loadBotAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)
const myBot = new EchoBot()

const app = express()

app.use(rateLimit({ validate: { xForwardedForHeader: false } }))
app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  // console.log(req.body)
  // console.log('req.user', req.user)
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
