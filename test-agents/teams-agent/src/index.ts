// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-hosting'
import { TeamsCloudAdapter } from '@microsoft/agents-hosting-teams'

import { TeamsHandler } from './teamsHandler'
import { TeamsMultiFeature } from './teamsMultiFeature'
import path from 'path'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const createAgent = (agentName: string) => {
  switch (agentName) {
    case 'TeamsHandler':
      return new TeamsHandler()
    case 'TeamsMultiFeature':
      return new TeamsMultiFeature()
    default:
      throw new Error(`Agent with name ${agentName} is not recognized.`)
  }
}

const adapter = new TeamsCloudAdapter(authConfig)

const agentName = process.env.agentName || 'TeamsHandler'
const myAgent = createAgent(agentName)

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
  await adapter.process(req, res, async (context) => await myAgent.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
}).on('error', console.error)
