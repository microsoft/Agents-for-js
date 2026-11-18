// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { parseArgs } from 'node:util'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'
import { type AgentRunnerOptions } from './runner'

export function parseRunnerArguments (args: string[]): AgentRunnerOptions | 'help' | 'version' {
  let values
  try {
    values = parseArgs({
      args,
      options: {
        port: { type: 'string' },
        'agent-module': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' }
      }
    }).values
  } catch (cause) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidArguments, cause instanceof Error ? cause : undefined, {
      detail: cause instanceof Error ? cause.message : String(cause)
    })
  }
  if (values.help) {
    return 'help'
  }
  if (values.version) {
    return 'version'
  }
  const port = Number(values.port)
  if (!values.port || !/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidArguments, undefined, {
      detail: '--port must be an integer between 1 and 65535.'
    })
  }
  if (!values['agent-module']?.trim()) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidArguments, undefined, {
      detail: '--agent-module must specify a module path.'
    })
  }
  return { port, agentModulePath: values['agent-module'] }
}
