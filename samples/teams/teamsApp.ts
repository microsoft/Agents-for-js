// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
  AdaptiveCard,
  AgentApplication,
  CardFactory,
  MessageFactory,
  TurnContext,
  TurnState,
} from '@microsoft/agents-hosting'

import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'

type ApplicationTurnState = TurnState
export const app = new AgentApplication({
  // removeRecipientMention: false
})

const teamsExtension = new TeamsAgentExtension(app)

app.registerExtension(teamsExtension, tae => {

})

app.adaptiveCards.actionExecute('doStuff', async (context, state, data) => {
  const card = {
    type: 'AdaptiveCard',
    body: [
      {
        type: 'TextBlock',
        size: 'Medium',
        weight: 'Bolder',
        text: '✅[ACK] Test'
      },
      {
        type: 'TextBlock',
        text: 'doStuff action executed',
        wrap: true
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  }
  return card as AdaptiveCard
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  const membersAdded = context.activity.membersAdded ?? []
  const welcomeText = 'Hello from teamsApp!'
  for (const member of membersAdded) {
    if (member.id !== (context.activity.recipient?.id ?? '')) {
      await context.sendActivity(MessageFactory.text(welcomeText, welcomeText))
    }
  }
})

app.message('/acInvoke', async (context: TurnContext, state: ApplicationTurnState) => {
  const card = {
    type: 'AdaptiveCard',
    body: [
      {
        type: 'TextBlock',
        size: 'Medium',
        weight: 'Bolder',
        text: 'Test Adaptive Card'
      },
      {
        type: 'TextBlock',
        text: 'Click the button to execute an action',
        wrap: true
      }
    ],
    actions: [
      {
        type: 'Action.Execute',
        title: 'Do Stuff',
        verb: 'doStuff'
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  }
  await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
})

startServer(app)
