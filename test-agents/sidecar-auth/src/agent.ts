// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import {
  AgentApplication,
  MemoryStorage,
  TurnContext,
  TurnState,
  loadAuthConfigFromEnv,
  SidecarAuthProvider
} from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'

// Credential-free provider: token acquisition is delegated to the Entra Agent ID
// sidecar (agent container). The connection is configured via env (authType=EntraAuthSideCar).
const sidecar = new SidecarAuthProvider(loadAuthConfigFromEnv())

class SidecarAuthAgent extends AgentApplication<TurnState> {
  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/health', this.health)
    this.onMessage('/token', this.token)
    this.onActivity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    await ctx.sendActivity(`Sidecar Auth Agent running on node sdk ${version}. Commands: /help, /health, /token`)
  }

  echo = async (ctx: TurnContext, state: TurnState) => {
    let counter: number = state.getValue('conversation.counter') || 0
    await ctx.sendActivity(`[${counter++}] You said: ${ctx.activity.text}`)
    state.setValue('conversation.counter', counter)
  }

  // Reports whether the Entra Agent ID sidecar (agent container) is reachable.
  health = async (ctx: TurnContext) => {
    const healthy = await sidecar.isHealthy()
    await ctx.sendActivity(healthy ? '✅ Sidecar is healthy' : '❌ Sidecar is not reachable')
  }

  // Acquires an app-only access token from the sidecar for Microsoft Graph.
  token = async (ctx: TurnContext) => {
    try {
      const token = await sidecar.getAccessToken('https://graph.microsoft.com/.default')
      await ctx.sendActivity(`Acquired a token from the sidecar (length: ${token.length}).`)
    } catch (err) {
      await ctx.sendActivity(`Failed to acquire a token from the sidecar: ${(err as Error).message}`)
    }
  }
}

startServer(new SidecarAuthAgent())
