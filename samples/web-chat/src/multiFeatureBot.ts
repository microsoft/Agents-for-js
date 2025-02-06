// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Attachment } from '@microsoft/agents-activity-schema'
import { ActivityHandler, MessageFactory, TurnContext } from '@microsoft/agents-bot-hosting'
import * as AdaptiveCardsTemplating from 'adaptivecards-templating'
import AdaptiveCardActions from '../resources/AdaptiveCardActions.json'

export class MultiFeatureBot extends ActivityHandler {
  constructor () {
    super()

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded
      if (membersAdded != null) {
        for (let cnt = 0; cnt < membersAdded.length; cnt++) {
          if ((context.activity.recipient != null) && membersAdded[cnt].id !== context.activity.recipient.id) {
            await this.sendSuggestedActionsAsync(context)
            await next()
          }
        }
      }
    })

    this.onMessage(async (context, next) => {
      if (context.activity.text === 'Display Feature options' || (context.activity.text === undefined && context.activity.value !== undefined)) {
        await this.sendSuggestedActionsAsync(context)
        await next()
        return
      }
      await this.runOperationAsync(context, context.activity.text!)
      await next()
    })
  }

  private async sendSuggestedActionsAsync (turnContext: TurnContext): Promise<void> {
    const reply = MessageFactory.text('What feature would you like to test?')
    reply.suggestedActions = {
      actions: [
        { title: 'Adaptive Card Template', type: 'imBack', value: 'AdaptiveCardTemplate' },
        { title: 'Card Factory', type: 'imBack', value: 'CardFactory' },
        { title: 'State', type: 'imBack', value: 'State' },
        { title: 'SSO', type: 'imBack', value: 'SSO' },
        { title: 'Attachments', type: 'imBack', value: 'Attachments' }
      ],
      to: [turnContext.activity.from?.id ?? 'defaultId']
    }

    await turnContext.sendActivity(reply)
  }

  private async runOperationAsync (context: TurnContext, operationName: string): Promise<void> {
    switch (operationName) {
      case 'AdaptiveCardTemplate':
        {
          const card = this.getAdaptiveCard(AdaptiveCardActions, context.activity.from?.name)
          await context.sendActivity(MessageFactory.attachment(card))
        }
        break
      case 'CardFactory':
        await context.sendActivity('To pick which feature to test, type "Display Feature options".')
        break
      case 'State':
        await context.sendActivity('To pick which feature to test, type "Display Feature options".')
        break
      case 'SSO':
        await context.sendActivity('To pick which feature to test, type "Display Feature options".')
        break
      case 'Attachments':
        await context.sendActivity('To pick which feature to test, type "Display Feature options".')
        break
      default:
      {
        if (operationName === undefined && context.activity.value !== undefined) {
          await context.sendActivity('Received value: ' + context.activity.value)
          return
        }
        await context.sendActivity('Received value: ' + operationName)
      }
    }
  }

  private getAdaptiveCard (adaptiveCardJson: any, name: string | undefined): Attachment {
    const template: AdaptiveCardsTemplating.Template = new AdaptiveCardsTemplating.Template(adaptiveCardJson)
    const payloadData = {
      createdBy: name
    }

    const cardJsonString = template.expand({ $root: payloadData })
    const adaptiveCardAttachment: Attachment = {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: cardJsonString
    }

    return adaptiveCardAttachment
  }
}
