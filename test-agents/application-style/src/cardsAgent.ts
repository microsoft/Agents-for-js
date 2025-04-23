// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TurnState, MemoryStorage, TurnContext, AgentApplication, AgentApplicationBuilder, MessageFactory } from '@microsoft/agents-hosting'
import { CardMessages } from './cards/cardMessages'
import CardFactoryCard from './cards/CardFactoryCard.json'
import AdaptiveCardActions from './cards/AdaptiveCardActions.json'
import * as AdaptiveCardsTemplating from 'adaptivecards-templating'
import { Attachment } from '@microsoft/agents-activity'

const storage = new MemoryStorage()
export const cardAgent: AgentApplication<TurnState> = new AgentApplicationBuilder<TurnState>().withStorage(storage).build()

const cards = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await CardMessages.sendIntroCard(context)
}

cardAgent.conversationUpdate('membersAdded', async (t, s) => {
  await t.sendActivity('Welcome to the Cards Agent! type /cards or /cardActions or /suggestedActions.')
})

cardAgent.message('/cards', cards)
cardAgent.message('1', async (t, s) => await CardMessages.sendAdaptiveCard(t, CardFactoryCard))
cardAgent.message('2', async (t, s) => await CardMessages.sendAnimationCard(t))
cardAgent.message('3', async (t, s) => await CardMessages.sendAudioCard(t))
cardAgent.message('4', async (t, s) => await CardMessages.sendHeroCard(t))
cardAgent.message('5', async (t, s) => await CardMessages.sendReceiptCard(t))
cardAgent.message('6', async (t, s) => await CardMessages.sendOauthCard(t))
cardAgent.message('7', async (t, s) => await CardMessages.sendO365ConnectorCard(t))
cardAgent.message('8', async (t, s) => await CardMessages.sendSigninCard(t))
cardAgent.message('9', async (t, s) => await CardMessages.sendThumbnailCard(t))
cardAgent.message('/ten', async (t, s) => await CardMessages.sendVideoCard(t))
cardAgent.message('/eleven', async (t, s) => await CardMessages.sendCardWithInvoke(t))

cardAgent.message('/cardActions', async (t, s) => {
  const template: AdaptiveCardsTemplating.Template = new AdaptiveCardsTemplating.Template(AdaptiveCardActions)
  const payloadData = {
    createdById: t.activity.from?.id,
    createdBy: t.activity.from?.name
  }

  const cardJsonString = template.expand({ $root: payloadData })
  const adaptiveCardAttachment: Attachment = {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: cardJsonString
  }
  await t.sendActivity(MessageFactory.attachment(adaptiveCardAttachment))
})

cardAgent.message('/suggestedActions', async (t, s) => {
  const reply = MessageFactory.text('What is your favorite color?')
  reply.suggestedActions = {
    actions: [
      { title: 'Red', type: 'imBack', value: 'Red' },
      { title: 'Green', type: 'imBack', value: 'Green' },
      { title: 'Blue', type: 'imBack', value: 'Blue' }
    ],
    to: [t.activity.from?.id ?? 'defaultId']
  }

  await t.sendActivity(reply)
})

cardAgent.activity('message', async (t, s) => {
  const text = t.activity.text?.toLowerCase() ?? ''
  if (t.activity.value != null) {
    const submittedData = JSON.stringify(t.activity.value, null, 2)
    const replyText = `Data Submitted:\n${submittedData}`

    await t.sendActivity(MessageFactory.text(replyText))
  } else if (text.includes('red') || text.includes('blue') || text.includes('green')) {
    const replyText = `I agree, ${text} is the best color!`
    await t.sendActivity(MessageFactory.text(replyText))
  } else {
    await t.sendActivity('Welcome to the Cards Agent! type /cards or /cardActions or /suggestedActions.')
  }
})
