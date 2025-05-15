// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'

class EmptyAgent extends AgentApplication<TurnState> {
  constructor (storage?: Storage) {
    super({ storage })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onActivity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    await ctx.sendActivity(`Welcome to the Empty Agent sample. Type /help for help, /diag for diagnostics, 
                            or send a message to see the echo feature in action.`)
  }

  echo = async (ctx: TurnContext, state: TurnState) => {
    let counter: number = state.getValue('conversation.counter') || 0
    await ctx.sendActivity(`[${counter++}]You said now: ${ctx.activity.text}`)
    state.setValue('conversation.counter', counter)
  }

  diag = async (ctx: TurnContext, state: TurnState) => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    await ctx.sendActivity(`Empty Agent running on node sdk ${version}`)
    const md = (text: string) => '```\n' + text + '\n```'
    await ctx.sendActivity(md(JSON.stringify(state, null, 2)))
  }
}

startServer(new EmptyAgent(new MemoryStorage()))
