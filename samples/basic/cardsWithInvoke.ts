import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'

const sendCardWithInvoke = async (context: TurnContext, state: TurnState): Promise<void> => {
  const card = MessageFactory.attachment({
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.5',
      body: [
        {
          type: 'TextBlock',
          text: 'Hello world'
        },
        {
          type: 'Input.Text',
          id: 'defaultInputId',
          placeholder: 'enter comment',
          maxLength: 6
        }
      ],
      actions: [
        {
          type: 'Action.Execute',
          title: 'Click me',
          verb: 'doStuff',
          data: {
            action: 'my action'
          }
        }
      ]
    }
  })
  await context.sendActivity(card)
}

const agent = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
agent.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the CardInvoke sample, send a message to see the echo feature in action.')
})
agent.onMessage('/card', sendCardWithInvoke)
agent.onActivity('invoke', async (context: TurnContext, state: TurnState) => {
  await context.sendActivity('Invoke received ' + JSON.stringify(context.activity.value))
})
agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${JSON.stringify(context.activity.value)}`)
  state.setValue('conversation.counter', counter)
})
startServer(agent)
