// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { A2AAdapter } from '@microsoft/agents-hosting-a2a'
import { version } from '@microsoft/agents-hosting/package.json'
import type { AgentCard } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }

const url = 'https://822mdt9b-3978.use.devtunnels.ms' // <-- REPLACE WITH YOUR PUBLIC AGENT URL

// 1. Define your agent's identity card.
const helloAgentCard: AgentCard = {
  name: 'GOAT BOT 9000',
  description: 'the internet\'s first cyber goat',
  protocolVersion: '0.3.0',
  version: '0.1.0',
  url: `${url}/a2a/jsonrpc`, // The public URL of your agent server
  skills: [{ id: 'chat', name: 'Chat', description: 'Say hello', tags: ['chat'] }],
  capabilities: {
    streaming: true,
    stateTransitionHistory: true, // Agent uses history
    pushNotifications: false,
  },
  preferredTransport: 'JSONRPC',
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  additionalInterfaces: [
    { url: `${url}/a2a/jsonrpc`, transport: 'JSONRPC' }, // Default JSON-RPC transport
    { url: `${url}/a2a/rest`, transport: 'HTTP+JSON' }, // HTTP+JSON/REST transport
    // { url: 'localhost:4001', transport: 'GRPC' }, // GRPC transport
  ],
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
    const counter: number = state.getValue('conversation.counter') || 0
    // await ctx.sendActivity(`[${counter++}]You said now: ${ctx.activity.text}`)

    // now, lets use the identity info if we have to get a token
    // this requires a new auth handler
    // but should allow
    // const userTokenResponse = await this.authorization.getToken(context, 'graph')
    // const userInfo = await getUserInfo(userTokenResponse?.token!)
    if (ctx.identity) {
      await ctx.sendActivity(`Hello ${ctx.identity.name}! You said: ${ctx.activity.text}`)
    } else {
      await ctx.sendActivity('YOUR ORDER HAS BEEN CANCELED')
    }
    state.setValue('conversation.counter', counter)
  }

  diag = async (ctx: TurnContext, state: TurnState) => {
    const md = (text: string) => '```\n' + text + '\n```'
    await ctx.sendActivity(md(JSON.stringify(state, null, 2)))
  }

  stream = async (ctx: TurnContext, state: TurnState) => {
    // await ctx.sendActivity('Starting streaming...')
    // await ctx.sendActivity(`IS SSTREAMING CHANNEL: ${ctx.streamingResponse.isStreamingChannel}`)

    ctx.streamingResponse.setFeedbackLoop(true)
    ctx.streamingResponse.setGeneratedByAILabel(true)
    ctx.streamingResponse.setSensitivityLabel({ type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'Internal' })
    await ctx.streamingResponse.queueInformativeUpdate('starting streaming response')

    for (let i = 0; i < 5; i++) {
      console.log(`Streaming chunk ${i + 1}`)
      await ctx.streamingResponse.queueTextChunk(`part ${i + 1}`)
      await new Promise(resolve => setTimeout(resolve, i * 500))
    }

    console.log('ENDING STREAM THUS SENDING FINAL MESSAGE')
    await ctx.streamingResponse.endStream()
  }
}
const agent = new EmptyAgent()
const app = startServer(agent)
const a2aadapter = new A2AAdapter(helloAgentCard, agent.run.bind(agent), new MemoryStorage())

// this middleware causes invalid JSON to be rejected with a specific JSON-RPC error code
// @ts-ignore
app.use((err, req, res, next) => {
  console.log('ERROR MIDDLEWARE', JSON.stringify(err, null, 2))

  if (err instanceof SyntaxError && 'body' in err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Invalid JSON payload',
      }
    }
    return res.status(400).json(errorResponse)
  }

  return next(err) // if it's not a 400, let the default error handling do it.
})

app.use('/a2a/jsonrpc', a2aadapter.jsonHandler)
app.use('/a2a/rest', a2aadapter.restHandler)

//   (req, res, next) => {
//   a2aadapter.process(req, res, next, (context) => agent.run(context))
// })

// app.use('/a2a/rest', (req, res, next) => {
//   a2aadapter.processRest(req, res, next, (context) => agent.run(context))
// })

app.get('/.well-known/agent.json', (req, res) => {
  console.log('---- HANDLING AGENT CARD REQUEST ----')
  a2aadapter.handleCardRequest(req, res)
})
app.get('/.well-known/agent_card.json', (req, res) => {
  console.log('---- HANDLING AGENT CARD REQUEST ----')
  a2aadapter.handleCardRequest(req, res)
})
