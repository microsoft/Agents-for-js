/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler, AgentApplication, AuthConfiguration, CloudAdapter, getAuthConfigWithDefaults, HeaderPropagationDefinition, Request, TurnState } from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
import express, { Response } from 'express'

export interface StartServerOptions {
  authConfiguration?: AuthConfiguration
  configureAdapter?: (adapter: CloudAdapter) => void
}

function isStartServerOptions (value: AuthConfiguration | StartServerOptions | undefined): value is StartServerOptions {
  return !!value && (
    'authConfiguration' in value ||
    'configureAdapter' in value
  )
}

function getStartServerOptions (authConfigurationOrOptions?: AuthConfiguration | StartServerOptions): StartServerOptions {
  if (isStartServerOptions(authConfigurationOrOptions)) {
    return authConfigurationOrOptions
  }

  return { authConfiguration: authConfigurationOrOptions }
}

export function myStartServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfiguration?: AuthConfiguration): express.Express
export function myStartServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, options?: StartServerOptions): express.Express
export function myStartServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfigurationOrOptions?: AuthConfiguration | StartServerOptions) : express.Express {
  const options = getStartServerOptions(authConfigurationOrOptions)
  const authConfig: AuthConfiguration = getAuthConfigWithDefaults(options.authConfiguration)
  let adapter: CloudAdapter
  let headerPropagation: HeaderPropagationDefinition | undefined
  if (agent instanceof ActivityHandler || !agent.adapter) {
    adapter = new CloudAdapter()
  } else {
    adapter = agent.adapter as CloudAdapter
    headerPropagation = (agent as AgentApplication<TurnState<any, any>>)?.options.headerPropagation
  }

  options.configureAdapter?.(adapter)

  const server = express()
  server.use(express.json())
  // server.use(authorizeJWT(authConfig))

  server.post('/api/messages', (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context)
    , headerPropagation)
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    console.log(`\nServer listening to port ${port} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
  return server
}
