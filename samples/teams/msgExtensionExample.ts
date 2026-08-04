import { AdaptiveCard, AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension, TeamsTurnContext } from '@microsoft/agents-hosting-extensions-msteams'
import { AppBasedLinkQuery, MessagingExtensionAction, MessagingExtensionActionResponse, MessagingExtensionQuery, MessagingExtensionResponse } from '@microsoft/teams.api'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
  console.log('Teams extension registered')

  tae.messageExtensions
    .onQueryLink(async (context: TeamsTurnContext, state: TurnState, query: AppBasedLinkQuery | undefined) : Promise<MessagingExtensionResponse> => {
      await context.sendActivity(`Received a message with the link: ${query?.url}`)
      return {
        composeExtension: {
          attachmentLayout: 'list',
          type: 'result',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.thumbnail',
              content: {
                title: 'Link Preview',
                text: `You clicked on a link: ${query?.url}`,
                tap: {
                  type: 'invoke',
                  value: {
                    title: 'Link Clicked',
                    text: `You clicked on the link: ${query?.url}`
                  }
                }
              }
            }
          ]
        }
      }
    })
    .onQuery('searchQuery', async (context: TeamsTurnContext, state: TurnState, query: MessagingExtensionQuery) : Promise<MessagingExtensionResponse> => {
      console.log('Received message extension query:', query)

      const initialRun = query.parameters?.find(p => p.name === 'initialRun')?.value?.toString() === 'true'
      if (initialRun) {
        return Promise.resolve(
          {
            composeExtension: {
              type: 'message',
              text: 'Enter search query'
            }
          })
      }

      const searchQuery = query.parameters?.find(p => p.name === 'searchQuery')?.value?.toString() ?? ''

      const attachments = []

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

        const previewCard = {
          contentType: 'application/vnd.microsoft.card.thumbnail',
          content: {
            title: `Result ${i}`,
            text: `This is a preview of result ${i} for query '${searchQuery}'.`,
            tap: {
              type: 'invoke',
              value: { index: i, query: searchQuery }
            }
          }
        }

        const attachment = {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
          preview: previewCard
        }

        attachments.push(attachment)
      }

      const msgExtResponse: MessagingExtensionResponse = {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'list',
          attachments
        }
      }

      return Promise.resolve(msgExtResponse)
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

      const msgExtResponse: MessagingExtensionResponse = {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'list',
          attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }]
        }
      }

      return Promise.resolve(msgExtResponse)
    })

    .onSubmitAction('createCard', async (context: TeamsTurnContext, state: TurnState, action: MessagingExtensionAction) : Promise<MessagingExtensionActionResponse> => {
      const title = action.data.title || 'No Title'
      const description = action.data.description || 'No Description'
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

      const msgExtActionResponse: MessagingExtensionActionResponse = {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'list',
          attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }]
        }
      }
      return Promise.resolve(msgExtActionResponse)
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
