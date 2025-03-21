import { AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request } from '@microsoft/agents-bot-hosting'
import express, { Response } from 'express'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new CloudAdapter(authConfig)

const server = express()
server.use(express.json())
server.use(authorizeJWT(authConfig))

async function loadModule () {
  const moduleName = process.env.botName || 'webChat'
  let module
  switch (moduleName) {
    case 'WebChat':
      module = (await import('./webChat')).app
      return module
    case 'WebChat-State':
      module = (await import('./stateBot')).app
      return module
    case 'WebChat-State-Blob':
      module = (await import('./stateBotBlobStorage')).app
      return module
    case 'WebChat-State-Cosmos':
      module = (await import('./stateBotCosmosDB')).app
      return module
    default:
      throw new Error(`Bot with name ${moduleName} is not recognized.`)
  }
}

server.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    const app = await loadModule()
    await app.run(context)
  })
})

const port = process.env.PORT || 3978
server.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
