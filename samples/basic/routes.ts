// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState, RouteRank, Storage } from '@microsoft/agents-hosting'

class EmptyAgent extends AgentApplication<TurnState> {
  constructor (storage?: Storage) {
    super({ storage })

    // this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('foo', this.foo)
    this.onMessage('fooBar', this.fooBar)
    this.onMessage('FOO', this.FOO)
    this.onActivity('message', this.echo)
    this.onMessage('dupText', this.dupText1, undefined, RouteRank.Last) // Last evaluated route. Shouldn't be reached.
    this.onMessage('dupText', this.dupText2, undefined, RouteRank.First) // First evaluated route. Should be executed first.
    this.onMessage('agentic', this.agentic, [], undefined, true)
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

  dupText1 = async (ctx: TurnContext) => {
    await ctx.sendActivity('Last ranked dupText')
  }

  dupText2 = async (ctx: TurnContext) => {
    await ctx.sendActivity('First ranked dupText')
  }

  agentic = async (ctx: TurnContext) => {
    // This handler shouldn't be reached unless an agentic request is sent.
    await ctx.sendActivity('Hit the Agentic handler')
  }
}

startServer(new EmptyAgent(new MemoryStorage()))
