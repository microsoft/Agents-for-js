// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { type Server } from 'node:http'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import express from 'express'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { type CloudAdapter, type HeaderPropagationDefinition, type TurnContext } from '@microsoft/agents-hosting'
import { createRunnerAuthentication } from './authentication'
import { preloadRunnerConfiguration } from './configuration'
import { Errors } from './errorHelper'

/** Options for hosting a compiled module's named `agent` export. */
export interface AgentRunnerOptions {
  /** TCP port, from 1 through 65535. The listener binds only to 127.0.0.1. */
  port: number
  /** Filesystem path to a JavaScript module exporting an AgentApplication instance as `agent`. */
  agentModulePath: string
}

interface RunnerAgent {
  run(context: TurnContext): Promise<void>
  adapter: Pick<CloudAdapter, 'process'>
  options?: { headerPropagation?: HeaderPropagationDefinition }
}

function isRunnerAgent (value: unknown): value is RunnerAgent {
  return value !== null && typeof value === 'object' &&
    'run' in value && typeof value.run === 'function' &&
    'adapter' in value && value.adapter !== null && typeof value.adapter === 'object' &&
    'process' in value.adapter && typeof value.adapter.process === 'function' &&
    (!('options' in value) || (value.options !== null && typeof value.options === 'object'))
}

/**
 * Loads configuration before importing the agent and starts an authenticated loopback listener.
 * Call once per process; the returned server can be closed by the host.
 *
 * @param options - Agent module path and required TCP port.
 * @returns The listening HTTP server.
 */
export async function startAgentRunner (options: AgentRunnerOptions): Promise<Server> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535 ||
    !options.agentModulePath?.trim()) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidArguments, undefined, {
      detail: 'A module path and integer port between 1 and 65535 are required.'
    })
  }
  const filePath = resolve(options.agentModulePath)
  const { authConfig, additionalIssuers } = await preloadRunnerConfiguration(dirname(filePath))
  let module: { agent?: unknown }
  try {
    module = await import(pathToFileURL(filePath).href)
  } catch (cause) {
    throw ExceptionHelper.generateException(
      Error, Errors.ModuleLoadFailed, cause instanceof Error ? cause : undefined, { filePath }
    )
  }
  const agent = module.agent
  if (!isRunnerAgent(agent)) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidAgentExport, undefined, { filePath })
  }

  const app = express()
  app.set('env', 'production')
  app.disable('x-powered-by')
  app.post('/api/messages', createRunnerAuthentication(authConfig, additionalIssuers), express.json(),
    async (req, res) => {
      await agent.adapter.process(req, res, context => agent.run(context), agent.options?.headerPropagation)
    })
  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server)
    })
    server.once('error', reject)
  })
}
