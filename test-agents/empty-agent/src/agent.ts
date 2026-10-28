// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import {
  AgentApplication,
  createJsonFileConfigurationSource,
  MemoryStorage,
  preloadConfigurationSources,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
import { parseArgs } from 'node:util'

async function preloadJsonConfiguration (): Promise<void> {
  const { values } = parseArgs({
    options: {
      'config-file': {
        type: 'string'
      }
    }
  })
  const configFile = values['config-file']
  if (!configFile) {
    return
  }

  await preloadConfigurationSources([{
    source: createJsonFileConfigurationSource(configFile),
    mode: 'overrideEnvironment'
  }])
}

class EmptyAgent extends AgentApplication<TurnState> {
  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this.help)
    this.onMessage('/help', this.help)
    this.onMessage('/diag', this.diag)
    this.onMessage('/stream', this.stream)
    this.onActivity('message', this.echo)
  }

  help = async (ctx: TurnContext) => {
    await ctx.sendActivity(`Empty Agent running on node sdk ${version}. Commands: /help, /diag, /stream`)
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

  stream = async (ctx: TurnContext, state: TurnState) => {
    ctx.streamingResponse.setFeedbackLoop(true)
    ctx.streamingResponse.setGeneratedByAILabel(true)
    ctx.streamingResponse.setSensitivityLabel({ type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'Internal' })
    await ctx.streamingResponse.queueInformativeUpdate('starting streaming response')

    for (let i = 0; i < 5; i++) {
      console.log(`Streaming chunk ${i + 1}`)
      await ctx.streamingResponse.queueTextChunk(`part ${i + 1}`)
      await new Promise(resolve => setTimeout(resolve, i * 500))
    }

    await ctx.streamingResponse.endStream()
  }
}

;(async () => {
  await preloadJsonConfiguration()
  startServer(new EmptyAgent())
})()
