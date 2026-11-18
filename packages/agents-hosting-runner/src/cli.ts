#!/usr/bin/env node
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { version } from '../package.json'
import { parseRunnerArguments } from './arguments'

async function main (): Promise<void> {
  const args = parseRunnerArguments(process.argv.slice(2))
  if (args === 'help') {
    console.log('Usage: agent-runner --agent-module <compiled.js> --port <1-65535>\n\nOptions:\n  --help, -h   Show help\n  --version    Show version')
  } else if (args === 'version') {
    console.log(version)
  } else {
    process.env.NODE_ENV = 'production'
    const { startAgentRunner } = await import('./runner.js')
    const server = await startAgentRunner(args)
    console.log(`Agent runner listening on http://127.0.0.1:${args.port}/api/messages`)
    const shutdown = () => {
      server.close(error => {
        if (error) {
          console.error(error)
          process.exitCode = 1
        }
      })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
