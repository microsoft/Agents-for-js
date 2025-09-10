// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const agent = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Trace Activities sample, send a message to see the feature in action.\nTrace activities are only shown in the Emulator channel.')
})

agent.onActivity('message', async (context: TurnContext) => {
  await context.sendTraceActivity('Testing Trace', 'This is a trace activity')
  await context.sendActivity('I sent you a Trace activity. Check the inspection panel')
})

startServer(agent)
