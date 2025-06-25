/**
 * @module agents-hosting-extensions-teams-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'

import { PredictedSayCommand } from '../planners'
import { Utilities } from '../Utilities'
import { AIEntity, AITurnState, ClientCitation } from '../types'
/**
 * @private
 * @param {boolean} feedbackLoopEnabled - If true, the feedback loop UI for Teams will be enabled.
 * @param {'default' | 'custom'} feedbackLoopType - the type of UI to use for feedback loop
 * @returns {''} - An empty string.
 */
export function sayCommand<TState extends AITurnState = AITurnState> (
  feedbackLoopEnabled: boolean = false,
  feedbackLoopType: 'default' | 'custom' = 'default'
) {
  return async (context: TurnContext, _state: TState, data: PredictedSayCommand) => {
    if (!data.response?.content) {
      return ''
    }

    let content = data.response.content
    const isTeamsChannel = context.activity.channelId === Channels.Msteams

    if (isTeamsChannel) {
      content = content.split('\n').join('<br>')
    }

    // If the response from AI includes citations, those citations will be parsed and added to the SAY command.
    let citations: ClientCitation[] | undefined

    if (data.response.context && data.response.context.citations.length > 0) {
      citations = data.response.context!.citations.map((citation, i) => {
        const clientCitation: ClientCitation = {
          '@type': 'Claim',
          position: i + 1,
          appearance: {
            '@type': 'DigitalDocument',
            name: citation.title || `Document #${i + 1}`,
            abstract: Utilities.snippet(citation.content, 477)
          }
        }

        return clientCitation
      })
    }

    // If there are citations, modify the content so that the sources are numbers instead of [doc1], [doc2], etc.
    const contentText = !citations ? content : Utilities.formatCitationsResponse(content)

    // If there are citations, filter out the citations unused in content.
    const referencedCitations = citations ? Utilities.getUsedCitations(contentText, citations) : undefined
    const channelData =
            feedbackLoopEnabled && feedbackLoopType
              ? {
                  feedbackLoop: {
                    type: feedbackLoopType
                  }
                }
              : { feedbackLoopEnabled }

    const entities: AIEntity[] = [
      {
        type: 'https://schema.org/Message',
        '@type': 'Message',
        '@context': 'https://schema.org',
        '@id': '',
        additionalType: ['AIGeneratedContent'],
        ...(referencedCitations ? { citation: referencedCitations } : {})
      }
    ]

    const activity = Activity.fromObject({
      type: ActivityTypes.Message,
      text: contentText,
      ...(isTeamsChannel ? { channelData } : {}),
      entities
    })

    await context.sendActivity(activity)

    return ''
  }
}
