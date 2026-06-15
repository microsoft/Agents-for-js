// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { createLocalAdapter, startNamedPipeServer } from '@microsoft/agents-hosting-directline-namedpipes'

/**
 * Named Pipe Agent — pipe-only echo agent.
 *
 * Communicates exclusively over named pipes via the DirectLine protocol.
 * No HTTP endpoint is exposed; no Azure/Entra credentials are required.
 *
 * This is the canonical shape for agents deployed behind the DirectLine App
 * Service extension (DirectLineFlex), where the sidecar handles external
 * authentication and relays traffic over the pipe.
 */
class NamedPipeAgent extends AgentApplication<TurnState> {
  constructor () {
    super({ startTypingTimer: false, storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this.welcome)
    this.onActivity('message', this.echo)
  }

  welcome = async (ctx: TurnContext) => {
    for (const member of ctx.activity.membersAdded ?? []) {
      if (member.id !== ctx.activity.recipient?.id) {
        await ctx.sendActivity('Hello and Welcome! I am a named-pipe agent.')
      }
    }
  }

  echo = async (ctx: TurnContext, state: TurnState) => {
    const counter: number = state.getValue('conversation.counter') || 0
    await ctx.sendActivity(`[${counter}] You said: ${ctx.activity.text}`)
    state.setValue('conversation.counter', counter + 1)
  }
}

// --- Startup ---

const PIPE_NAME = process.env.PIPE_NAME || 'bfv4.pipes'

const adapter = createLocalAdapter()
const agent = new NamedPipeAgent()

const service = await startNamedPipeServer(adapter, (ctx) => agent.run(ctx), {
  pipeName: PIPE_NAME
})

service.ready.then(() => {
  console.log(`Named pipe agent connected on '${PIPE_NAME}'`)
}).catch(() => {
  // Ready rejection means stop() was called before connecting — normal during shutdown
})

console.log(`Named pipe agent started, waiting for connection on '${PIPE_NAME}'...`)

// Graceful shutdown — handle both SIGINT (Ctrl-C) and SIGTERM (App Service / container).
// `process.once` ensures a repeat signal during a slow stop() doesn't double-trigger;
// the try/catch contains any rejection so it doesn't surface as an unhandled rejection
// during exit (EventEmitter does not await async listeners).
let shuttingDown = false
const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down...`)
  try {
    await service.stop()
  } catch (err) {
    console.error('Error during shutdown:', err)
  }
  process.exit(0)
}

process.once('SIGINT', () => { shutdown('SIGINT').catch(() => {}) })
process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => {}) })
