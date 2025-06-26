// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// import { startServer } from '@microsoft/agents-hosting-express'
import { Activity } from '@microsoft/agents-activity'
import { AgentApplication, FileStorage, TurnContext, TurnState, Storage, UserState, ConversationState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

// interface ActHistory {
//   timestamp: Date
//   activity: Activity
// }

interface AuthState {
  state?: string
  token?: string,
  contAct?: Activity
}

interface CounterState {
  counter?: number
}

class StateAgent extends AgentApplication<TurnState<CounterState, AuthState>> {
  private userState
  private conversationState
  constructor (public storage?: Storage) {
    super({ storage })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onActivity('message', this.echo)
    this.userState = new UserState(this.storage!)
    this.conversationState = new ConversationState(this.storage!)
  }

  help = async (ctx: TurnContext) => {
    await ctx.sendActivity(`Welcome to the Empty Agent sample. Type /help for help, /diag for diagnostics,
                            or send a message to see the echo feature in action.`)
  }

  echo = async (ctx: TurnContext, state: TurnState<CounterState, AuthState>) => {
    const contAct = state.user.contAct
    console.log('contAct:', contAct?.text)
    state.user.state = 'started'
    state.user.contAct = ctx.activity

    await ctx.sendActivity(`[${state.conversation.counter!++ || 0}]You said now: ${ctx.activity.text}`)
  }

  diag = async (ctx: TurnContext, state: TurnState) => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    await ctx.sendActivity(`Empty Agent running on node sdk ${version}`)
    const md = (text: string) => '```\n' + text + '\n```'
    await ctx.sendActivity(md(JSON.stringify(state, null, 2)))
  }
}

startServer(new StateAgent(new FileStorage('__state__')))
