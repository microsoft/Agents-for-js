import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'
import { MessagingExtensionQuery, MessagingExtensionResult } from '@microsoft/agents-hosting-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
  console.log('Teams extension registered')

  tae.messageExtension
    .onQuery(async (context: TurnContext, state: TurnState, query: MessagingExtensionQuery) : Promise<MessagingExtensionResult> => {
      console.log('Received message extension query:', query)

      const fakeResult = {
        title: 'Hello from the message extension!',
        text: 'This is a sample message extension response.' + query.commandId + ' ' + query.parameters![0].value
      }

      const msgExtResult: MessagingExtensionResult = {
        attachmentLayout: 'list',
        type: 'result',
        attachments: [
          {
            preview: {
              contentType: 'application/vnd.microsoft.card.thumbnail',
              content: {
                title: fakeResult.title,
                text: fakeResult.text,
                tap: {
                  type: 'invoke',
                  value: fakeResult
                }
              }
            },
            contentType: 'application/vnd.microsoft.card.hero',
            content: fakeResult
          }
        ]
      }

      return Promise.resolve(msgExtResult)
    })

  tae.messageExtension.onSelectItem(async (context: TurnContext, state: TurnState, item: any) : Promise<MessagingExtensionResult> => {
    console.log('Item selected:', JSON.stringify(item))
    await context.sendActivity(`You selected: ${item.title}`)
    return {}
  })
})

app.onMessageReactionAdded(async (context: TurnContext, state: TurnState) => {
  const reactionInfo = context.activity.reactionsAdded?.map(r => r.type).join(', ')
  console.log('Reaction added:', reactionInfo)
  await context.sendActivity(`You added a reaction: ${reactionInfo}`)
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''
  console.log('Received message:', text)
  await context.sendActivity(`I received your message in Teams: "${text}". Try adding a reaction!`)
})

startServer(app)
