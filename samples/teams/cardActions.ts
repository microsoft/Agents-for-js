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

type ApplicationTurnState = TurnState
export const app = new AgentApplication()
app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  const welcomeText = 'cardActions: /acExecute /acSubmit!'
  await context.sendActivity(MessageFactory.text(welcomeText, welcomeText))
})

app.adaptiveCards.actionSubmit('doStuff', async (context, state) => {
  await context.sendActivity('doStuff action submitted ' + JSON.stringify(context.activity.value))
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
        text: 'doStuff action executed ' + JSON.stringify(data),
        wrap: true
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  }
  return card as AdaptiveCard
})

app.message('/acExecute', async (context: TurnContext, state: ApplicationTurnState) => {
  const card: AdaptiveCard = {
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
      },
      {
        type: 'Input.Text',
        id: 'usertext',
        spacing: 'none',
        isMultiLine: 'false',
        placeholder: 'add some text and submit'
      }
    ],
    actions: [
      {
        type: 'Action.Execute',
        title: 'Execute doStuff',
        verb: 'doStuff'
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  }
  await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
})

app.message('/acSubmit', async (context: TurnContext, state: ApplicationTurnState) => {
  const card: AdaptiveCard = {
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
      },
      {
        type: 'Input.Text',
        id: 'usertext',
        spacing: 'none',
        isMultiLine: 'false',
        placeholder: 'add some text and submit'
      }
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Submit doStuff',
        data: {
          verb: 'doStuff',
          id: 'doStuff',
          type: 'Action.Submit',
          test: 'test',
          data: { name: 'test' }
        }
      }
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4'
  }
  await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
})

startServer(app)
