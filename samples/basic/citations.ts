// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes, addAIToActivity, ClientCitation, SensitivityUsageInfo } from '@microsoft/agents-activity'

class EmptyAgent extends AgentApplication<TurnState> {
  constructor (storage?: Storage) {
    super({ storage })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onActivity('message', this.echo)
    this.onActivity('invoke', this.invoke)
  }

  invoke = async (context: TurnContext, state: TurnState) => {
    const invokeResponse = Activity.fromObject({
      type: ActivityTypes.InvokeResponse,
      value: {
        status: 200,
      }
    })
    console.log('Received invoke activity:', context.activity)
    await context.sendActivity(invokeResponse)
  }

  help = async (ctx: TurnContext) => {
    const aiActivity = new Activity('message')
    aiActivity.text = `Welcome to the **Citations** sample. 
                        Type /help for help, /diag for diagnostics, 
                        or send a message to see the echo feature in action. [1] and [2]`

    aiActivity.channelData = { feedbackLoopEnabled: true }
    aiActivity.entities = [{ type: 'cosa', name: 'Empty Agent' }]
    const cit1: ClientCitation = {
      '@type': 'Claim',
      position: 1,
      appearance: {
        '@type': 'DigitalDocument',
        name: 'Sample Document',
        text: '{"type":"AdaptiveCard","$schema":"http://adaptivecards.io/schemas/adaptive-card.json","version":"1.6","body":[{"type":"TextBlock","text":"Adaptive Card text"}]}',
        encodingFormat: 'application/vnd.microsoft.card.adaptive',
        abstract: 'Sample citation for Empty Agent',
      }
    }
    const cit2: ClientCitation = {
      '@type': 'Claim',
      position: 2,
      appearance: {
        '@type': 'DigitalDocument',
        name: 'Sample Document',
        url: 'https://example.com/sample-document',
        abstract: 'Sample citation for Empty Agent',
      }
    }

    const usageInfo : SensitivityUsageInfo = {
      '@type': 'CreativeWork',
      type: 'https://schema.org/Message',
      name: 'Privatisimo'
    }

    addAIToActivity(aiActivity, [cit1, cit2], usageInfo)
    await ctx.sendActivity(aiActivity)
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
