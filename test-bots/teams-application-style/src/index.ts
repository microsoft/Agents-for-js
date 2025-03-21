import { AuthConfiguration, authorizeJWT, loadAuthConfigFromEnv, Request } from '@microsoft/agents-bot-hosting'
import { TeamsCloudAdapter } from '@microsoft/agents-bot-hosting-teams'
import express, { Response } from 'express'
import path from 'path'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new TeamsCloudAdapter(authConfig)

const server = express()
server.use(express.json())
server.use(authorizeJWT(authConfig))

async function loadModule () {
  const moduleName = process.env.botName || 'teamsJsBot'
  let module
  switch (moduleName) {
    case 'teamsJsBot':
      module = (await import('./teamsJsBot')).app
      return module
    case 'teamsSsoBot':
      module = (await import('./teamsSsoBot')).app
      return module
    default:
      throw new Error(`Bot with name ${moduleName} is not recognized.`)
  }
}

server.use(express.static(path.join(__dirname, '..', 'public')))

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
