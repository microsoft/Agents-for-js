import express, { Response } from 'express'
import { AgentApplication, AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request, TurnState } from '@microsoft/agents-hosting'
/**
   * Starts the server to listen for incoming requests.
   *
   * @param server - The Express application instance to use for the server.
   * @returns void
   *
   * @remarks
   * This method sets up the necessary routes for handling bot requests and starts
   * the server listening on the port specified in the environment (or 3978 by default).
   * It configures JWT authorization middleware and sets up the message endpoint.
   *
   * Example usage:
   * ```typescript
   * const app = new AgentApplication();
   * const expressApp = express().use(express.json());
   * app.startServer(expressApp);
   * ```
   */
export const startServer = (agent: AgentApplication<TurnState>) => {
  const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
  const adapter = new CloudAdapter(authConfig)
  const server = express()
  server.use(express.json())
  server.use(authorizeJWT(authConfig))

  server.post('/api/messages', async (req: Request, res: Response) =>
    await adapter.process(req, res, async (context) =>
      await agent.run(context)
    )
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    console.log(`\nServer listening to port ${port} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
}
