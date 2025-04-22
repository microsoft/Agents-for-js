import { AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request } from '@microsoft/agents-hosting'
import express, { Response } from 'express'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new CloudAdapter(authConfig)

const server = express()
server.use(express.json())
server.use(authorizeJWT(authConfig))

async function loadApp () {
  const moduleName = process.env.agentName || 'webChat'
  let module
  switch (moduleName) {
    case 'webChat':
      module = (await import('./webChat')).app
      return module
    case 'stateApp':
      module = (await import('./stateApp')).app
      return module
    case 'stateBlobApp':
      module = (await import('./stateBlobApp')).app
      return module
    case 'stateCosmosApp':
      module = (await import('./stateCosmosApp')).app
      return module
    case 'webChatSso':
      module = (await import('./webChatSso')).app
      return module
    case 'cardsAgent':
      module = (await import('./cardsAgent')).cardAgent
      return module
    default:
      throw new Error(`Agent with name ${moduleName} is not recognized.`)
  }
}

server.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    const app = await loadApp()
    await app.run(context)
  })
})

const port = process.env.PORT || 3978
server.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
