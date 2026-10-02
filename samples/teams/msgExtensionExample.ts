import { AdaptiveCard, AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension, TeamsTurnContext } from '@microsoft/agents-hosting-extensions-msteams'
import {
  AppBasedLinkQuery,
  Attachment,
  MessagingExtensionAction,
  MessagingExtensionActionResponse,
  MessagingExtensionQuery,
  MessagingExtensionResponse,
  ThumbnailCard
} from '@microsoft/teams.api'

const ADAPTIVE_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.adaptive'
const THUMBNAIL_CARD_CONTENT_TYPE = 'application/vnd.microsoft.card.thumbnail'

function createMessageResponse (text: string): MessagingExtensionResponse {
  return {
    composeExtension: {
      type: 'message',
      text
    }
  }
}

function createResultResponse (...attachments: Attachment[]): MessagingExtensionResponse {
  return {
    composeExtension: {
      type: 'result',
      attachmentLayout: 'list',
      attachments
    }
  }
}

function createAdaptiveCardAttachment (card: AdaptiveCard, preview?: ThumbnailCard): Attachment {
  const attachment: Attachment = {
    contentType: ADAPTIVE_CARD_CONTENT_TYPE,
    content: card
  }

  if (!preview) {
    return attachment
  }

  const previewAttachment: Attachment = {
    contentType: THUMBNAIL_CARD_CONTENT_TYPE,
    content: preview
  }

  return Object.assign(attachment, { preview: previewAttachment })
}

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
  console.log('Teams extension registered')

  tae.messageExtensions
    .onQueryLink(async (context: TeamsTurnContext, state: TurnState, query: AppBasedLinkQuery | undefined) : Promise<MessagingExtensionResponse> => {
      const url = query?.url
      console.log('Link query received:', url)
      if (!url) {
        return createMessageResponse('No URL provided')
      }

      const card = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            text: 'Link Preview',
            size: 'Large',
            weight: 'Bolder'
          },
          {
            type: 'TextBlock',
            text: url,
            wrap: true
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      const previewCard: ThumbnailCard = {
        title: 'Link Preview',
        text: url
      }

      return createResultResponse(createAdaptiveCardAttachment(card, previewCard))
    })
    .onQuery('searchQuery', async (context: TeamsTurnContext, state: TurnState, query: MessagingExtensionQuery) : Promise<MessagingExtensionResponse> => {
      console.log('Received message extension query:', query)

      const initialRun = query.parameters?.find(p => p.name === 'initialRun')?.value?.toString() === 'true'
      if (initialRun) {
        return createMessageResponse('Enter search query')
      }

      const searchQuery = query.parameters?.find(p => p.name === 'query')?.value?.toString() ?? ''

      const attachments: Attachment[] = []

      for (let i = 1; i <= 5; i++) {
        const card = {
          type: 'AdaptiveCard',
          body: [
            {
              type: 'TextBlock',
              text: `Search Result ${i}`,
              size: 'Large',
              weight: 'Bolder',
            },
            {
              type: 'TextBlock',
              text: `Query: ${searchQuery} - Result description for item ${i}`,
              size: 'Large',
              weight: 'Bolder',
            }
          ],
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4'
        } as AdaptiveCard

        const previewCard: ThumbnailCard = {
          title: `Result ${i}`,
          text: `This is a preview of result ${i} for query '${searchQuery}'.`,
          tap: {
            type: 'invoke',
            title: `Result ${i}`,
            value: { index: i, query: searchQuery }
          }
        }

        attachments.push(createAdaptiveCardAttachment(card, previewCard))
      }

      return createResultResponse(...attachments)
    })

    .onSelectItem(async (context: TeamsTurnContext, state: TurnState, item: any) : Promise<MessagingExtensionResponse> => {
      console.log('Item selected:', JSON.stringify(item))

      const card = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            text: 'Item Selected',
            color: 'good'
          },
          {
            type: 'TextBlock',
            text: `You selected item: ${item.index} for query: '${item.query}'`,
            wrap: true,
            separator: true,
            fontType: 'monospace'
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      return createResultResponse(createAdaptiveCardAttachment(card))
    })

    .onFetchAction('createCard', async (context: TeamsTurnContext, state: TurnState, action: MessagingExtensionAction): Promise<MessagingExtensionActionResponse> => {
      console.log('Create card task requested:', action.commandId)

      const card = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'Input.Text',
            id: 'title',
            label: 'Title',
            placeholder: 'Enter a title',
            isRequired: true,
            errorMessage: 'A title is required.'
          },
          {
            type: 'Input.Text',
            id: 'description',
            label: 'Description',
            placeholder: 'Enter a description',
            isMultiline: true,
            isRequired: true,
            errorMessage: 'A description is required.'
          }
        ],
        actions: [
          {
            type: 'Action.Submit',
            title: 'Create Card',
            data: {
              submitLocation: 'messagingExtensionFetchTask'
            }
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      return {
        task: {
          type: 'continue',
          value: {
            title: 'Create Card',
            height: 'small',
            width: 'small',
            card: createAdaptiveCardAttachment(card)
          }
        }
      }
    })

    .onSubmitAction('createCard', async (context: TeamsTurnContext, state: TurnState, action: MessagingExtensionAction) : Promise<MessagingExtensionActionResponse> => {
      const title = action.data.title
      const description = action.data.description
      console.log(`Creating card with Title: ${title} and Description: ${description}`)

      const card = {
        type: 'AdaptiveCard',
        body: [
          {
            type: 'TextBlock',
            size: 'Large',
            weight: 'Bolder',
            color: 'Good',
            text: 'Custom Card Created'
          },
          {
            type: 'TextBlock',
            size: 'Medium',
            weight: 'Bolder',
            text: title
          },
          {
            type: 'TextBlock',
            text: description,
            wrap: true,
            isSubtle: true
          }
        ],
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4'
      } as AdaptiveCard

      return createResultResponse(createAdaptiveCardAttachment(card))
    })

  tae.messageExtensions.onQuerySettingUrl(async (context: TeamsTurnContext, state: TurnState): Promise<MessagingExtensionResponse> => {
    console.log('Query settings URL requested')

    const msgExtResponse: MessagingExtensionResponse = {
      composeExtension: {
        type: 'config',
        suggestedActions: {
          actions: [
            {
              type: 'openUrl',
              value: 'https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview',
              title: 'Configure'
            }
          ]
        }
      }
    }
    return Promise.resolve(msgExtResponse)
  })
})

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''
  console.log('Received message:', text)
  await context.sendActivity('This is a message extension bot. Use the message extension commands in Teams to test functionality.')
})

startServer(app)
