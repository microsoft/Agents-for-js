// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

// The multi-level call is for checking the stacktrace logging.
function levelOne () {
  levelTwo()
}

function levelTwo () {
  levelThree()
}

function levelThree () {
  // We'll force an error by reading a property of undefined.
  const obj: any = undefined
  console.log(obj.property)
}

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Error Handling sample, send `/error` to force an error and see how it is handled.')
})

agent.onMessage('/error', async () => {
  levelOne()
})

agent.onActivity('message', async (context: TurnContext) => {
  await context.sendActivity(`You said: ${context.activity.text}`)
})

// This handler will replace the adapter's default onTurnError function.
agent.onError(async (context: TurnContext, error: Error) => {
  console.error(`An error occurred: ${error}`)
  await context.sendActivity('Sorry, something went wrong!')
})

startServer(agent)
