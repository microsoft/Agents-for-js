// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

class EmptyAgent extends AgentApplication<TurnState> {
  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })

    thisonConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onActivity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    await ctx.sendActivity(`Empty Agent running on node sdk ${version}`)
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

startServer(new EmptyAgent())
