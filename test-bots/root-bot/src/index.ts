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

app.post('/api/botresponse/v3/conversations/:conversationId/activities{/:activityId}', async (req: Request, res: Response) => {
  // memoryStorageSingleton()
  // 01. Read from memory using conversationId. We don't need to use botClientConfig
  // 02. Update activity
  console.log('params', req.params)
  const activity = Activity.fromObject(req.body!)
  const dataForBot = await MemoryStorage.getSingleInstance().read([req.params!.conversationId])
  const conversationReference = dataForBot[activity.conversation!.id].conversationReference
  console.log('Data for bot:', dataForBot)
  // activity.serviceUrl = encodeURI(dataForBot.botData.serviceUrl)
  // activity.conversation!.id = dataForBot.botData.conversationId
  // activity.id = req.params!.activityId
  activity.applyConversationReference(conversationReference)
  activity.conversation!.id = dataForBot[req.params!.conversationId].conversationReference.conversation.id
  activity.recipient = dataForBot[req.params!.conversationId].conversationReference.bot
  req.body = activity
  // TODO delete activity from memory.
  // Bot1.cs 174
  //  await _conversationIdFactory.DeleteConversationReferenceAsync(conversationId, cancellationToken).ConfigureAwait(false);

  // const callback = async (turnContext: TurnContext) => {
  //   activity.applyConversationReference(conversationReference)
  //   activity.id = req.params!.activityId
  //   activity.callerId = `urn:botframework:aadappid:${turnContext.activity.from?.id}`

  //   if (activity.type === 'endOfConversation') {
  //     await MemoryStorage.getSingleInstance().delete([activity.conversation!.id])
  //     // adapter.createTurnContext(activity)
  //     await myBot.run(turnContext)
  //   } else {
  //     await turnContext.sendActivity(activity)
  //   }
  // }

  // await adapter.continueConversation(conversationReference, callback)
  await adapter.process(req, res, async (context) => await myBot.run(context), true)
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nRootBot to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
