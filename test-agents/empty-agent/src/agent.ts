// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express from 'express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

class EmptyAgentHost extends AgentApplication<TurnState> {
  counter = -1
  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })
    this.counter = 0
    this.conversationUpdate('membersAdded', this.help)
    this.message('/help', this.help)
    this.message('/diag', this.diag)
    this.activity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    await ctx.sendActivity(`Empty Agent running on sdk ${version}`)
  }

  echo = async (ctx: TurnContext) => {
    await ctx.sendActivity(`[${this.counter++}]You said ${ctx.activity.text}`)
  }

  diag = async (ctx: TurnContext) => {
    await ctx.sendActivity(JSON.stringify(ctx.turnState, null, 2))
  }
}

new EmptyAgentHost().startServer(express().use(express.json()))
