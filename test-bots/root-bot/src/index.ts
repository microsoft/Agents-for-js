// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, ConversationState, MemoryStorage, Activity } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'
import { RootBot } from './bot'
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const conversationState = new ConversationState(new MemoryStorage())

const adapter = new CloudAdapter(authConfig)
const myBot = new RootBot(conversationState)

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  // console.log(req.body)
  // console.log('req.user', req.user)
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

app.post('/api/botresponse/v3/conversations/:conversationId/activities/:activityId', async (req: Request, res: Response) => {
  // memoryStorageSingleton()
  // 01. Read from memory using conversationId. We don't need to use botClientConfig
  // 02. Update activity
  console.log('params', req.params)
  const dataForBot = await MemoryStorage.getSingleInstance().read(['botData'])
  console.log('Data for bot:', dataForBot)
  const activity = Activity.fromObject(req.body!)
  activity.serviceUrl = encodeURI(dataForBot.botData.serviceUrl)
  activity.conversation!.id = dataForBot.botData.conversationId
  activity.replyToId = req.params!.activityId
  console.log(activity)
  req.body = activity

  await adapter.process(req, res, async (context) => await myBot.run(context), true)
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nRootBot to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
