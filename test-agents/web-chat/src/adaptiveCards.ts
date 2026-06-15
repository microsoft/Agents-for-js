// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, CardFactory, MessageFactory, TurnContext } from '@microsoft/agents-hosting'
import AdaptiveCardActions from '../cards/AdaptiveCardActions.json'
import ToggleVisible from '../cards/ToggleVisibleCard.json'

const commandString = 'Please use one of these commands: **Card Actions** for Adaptive Card actions, **Suggested Actions** for suggested actions, and **ToggleVisibility** for toggling the visibility of the card.'

export class AdaptiveCardHandler extends ActivityHandler {
  constructor () {
    super()

    this.onMembersAdded(async (context) => {
      await context.sendActivity(MessageFactory.text(commandString))
    })

    this.onMessage(async (context, next) => {
      if (context.activity.text != null) {
        const text = context.activity.text?.toLowerCase() ?? ''

        if (text.includes('card actions')) {
          await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(AdaptiveCardActions)))
        } else if (text.includes('suggested actions')) {
          await context.sendActivity('Please select a color from the suggested action choices.')
          await AdaptiveCardHandler.sendSuggestedActionsAsync(context)
        } else if (text.includes('togglevisibility')) {
          await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(ToggleVisible)))
        } else if (text.includes('red') || text.includes('blue') || text.includes('green')) {
          const responseText = AdaptiveCardHandler.processInput(text)
          await context.sendActivity(responseText)
          await AdaptiveCardHandler.sendSuggestedActionsAsync(context)
        } else {
          await context.sendActivity(MessageFactory.text(commandString))
        }
      }

      await this.sendDataOnCardActions(context)
    })
  }

  private static processInput (text: string): string {
    const colorText = 'is the best color, I agree.'
    switch (text) {
      case 'red':
        return `Red ${colorText}`
      case 'green':
        return `Green ${colorText}`
      case 'blue':
        return `Blue ${colorText}`
      default:
        return 'Please select a color from the suggested action choices.'
    }
  }

  // ActionTypes.ImBack
  private static async sendSuggestedActionsAsync (turnContext: TurnContext): Promise<void> {
    const reply = MessageFactory.text('What is your favorite color?')
    reply.suggestedActions = {
      actions: [
        { title: 'Red', type: 'imBack', value: 'Red' },
        { title: 'Green', type: 'imBack', value: 'Green' },
        { title: 'Blue', type: 'imBack', value: 'Blue' }
      ],
      to: [turnContext.activity.from?.id ?? 'defaultId']
    }

    await turnContext.sendActivity(reply)
  }

  private async sendDataOnCardActions (turnContext: TurnContext): Promise<void> {
    if (turnContext.activity.value != null) {
      const submittedData = JSON.stringify(turnContext.activity.value, null, 2)
      const replyText = `Data Submitted:\n${submittedData}`

      await turnContext.sendActivity(MessageFactory.text(replyText))
    }
  }
}
