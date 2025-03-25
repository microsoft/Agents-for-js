// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, UserState, MemoryStorage } from '@microsoft/agents-hosting'
import { TeamsCloudAdapter } from '@microsoft/agents-hosting-teams'

import { TeamsHandler } from './teamsHandler'
import { TeamsSso } from './teamsSso'
import { TeamsMultiFeature } from './teamsMultiFeature'
import path from 'path'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const createBot = (botName: string) => {
  switch (botName) {
    case 'TeamsJsAgent':
      return new TeamsHandler()
    case 'TeamsSsoAgent':
    {
      const memoryStorage = new MemoryStorage()
      const userState = new UserState(memoryStorage)
      return new TeamsSso(userState)
    }
    case 'TeamsMultiFeatureAgent':
      return new TeamsMultiFeature()
    default:
      throw new Error(`Agent with name ${botName} is not recognized.`)
  }
}

const adapter = new TeamsCloudAdapter(authConfig)

const botName = process.env.botName || 'TeamsJsAgent'
const myBot = createBot(botName)

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.use(express.static(path.join(__dirname, '..', 'public')))

app.get('/Youtube', (_req, res) => {
  const filePath = path.join(__dirname, '../pages/youtube.html')
  res.sendFile(filePath)
})

app.get('/CustomForm', (_req, res) => {
  const filePath = path.join(__dirname, '../pages/customForm.html')
  res.sendFile(filePath)
})

app.post('/CustomForm', (_req) => {
  console.log('Data is being sent to the teams handler when this endpoint is called by teams')
})

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
}).on('error', console.error)
