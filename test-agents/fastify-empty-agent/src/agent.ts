// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-fastify'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
class EmptyAgent extends AgentApplication<TurnState> {
  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onActivity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    await ctx.sendActivity(`Fastify Empty Agent running on node sdk ${version}. Commands: /help, /diag`)
  }

  echo = async (ctx: TurnContext, state: TurnState) => {
    let counter: number = state.getValue('conversation.counter') || 0
    await ctx.sendActivity(`[${counter++}]You said now: ${ctx.activity.text}`)
    state.setValue('conversation.counter', counter)
  }

  diag = async (ctx: TurnContext, state: TurnState) => {
    const md = (text: string) => '```\n' + text + '\n```'
    await ctx.sendActivity(md(JSON.stringify(state, null, 2)))
  }
}

;(async () => {
  await startServer(new EmptyAgent())
})()
