// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'

class EmptyAgent extends AgentApplication<TurnState> {
  constructor (storage?: Storage) {
    super({ storage })

    // this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('foo', this.foo)
    this.onMessage('fooBar', this.fooBar)
    this.onMessage('FOO', this.FOO)
    this.onActivity('message', this.echo)
  }

  foo = async (ctx: TurnContext) => {
    await ctx.sendActivity('foo')
  }

  FOO = async (ctx: TurnContext) => {
    await ctx.sendActivity('FOO')
  }

  fooBar = async (ctx: TurnContext) => {
    await ctx.sendActivity('fooBar')
  }

  echo = async (ctx: TurnContext, state: TurnState) => {
    let counter: number = state.getValue('conversation.counter') || 0
    await ctx.sendActivity(`[${counter++}]You said now: ${ctx.activity.text}`)
    state.setValue('conversation.counter', counter)
  }
}

startServer(new EmptyAgent(new MemoryStorage()))
