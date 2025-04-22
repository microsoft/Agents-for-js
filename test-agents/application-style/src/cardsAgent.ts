// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TurnState, MemoryStorage, TurnContext, AgentApplication, AgentApplicationBuilder } from '@microsoft/agents-hosting'
import { CardMessages } from './cardMessages'
import CardFactoryCard from './cards/CardFactoryCard.json'

const storage = new MemoryStorage()
export const cardAgent: AgentApplication<TurnState> = new AgentApplicationBuilder<TurnState>().withStorage(storage).build()

const cards = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await CardMessages.sendIntroCard(context)
}

cardAgent.message('/cards', cards)
cardAgent.message('/1', async (t, s) => await CardMessages.sendAdaptiveCard(t, CardFactoryCard))
cardAgent.message('/2', async (t, s) => await CardMessages.sendAnimationCard(t))
cardAgent.message('3', async (t, s) => await CardMessages.sendAudioCard(t))
cardAgent.message('4', async (t, s) => await CardMessages.sendHeroCard(t))
cardAgent.message('5', async (t, s) => await CardMessages.sendReceiptCard(t))
cardAgent.message('6', async (t, s) => await CardMessages.sendOauthCard(t))
cardAgent.message('7', async (t, s) => await CardMessages.sendO365ConnectorCard(t))
cardAgent.message('8', async (t, s) => await CardMessages.sendSigninCard(t))
cardAgent.message('9', async (t, s) => await CardMessages.sendThumbnailCard(t))
cardAgent.message('10', async (t, s) => await CardMessages.sendVideoCard(t))
