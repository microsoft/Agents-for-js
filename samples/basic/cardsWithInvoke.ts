import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, MessageFactory, TurnContext, TurnState, AdaptiveCardInvokeResponse, InvokeResponse, ActivityHandler, InvokeException } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

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
agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the CardInvoke sample, send a message to see the echo feature in action.')
})
agent.onMessage('/card', sendCardWithInvoke)
agent.onActivity('invoke', async (context: TurnContext, state: TurnState) => {

  const adcdinkrsp: AdaptiveCardInvokeResponse = {
    statusCode: 200,
    type: ActivityTypes.InvokeResponse,
    value: 'Invoke received ' + JSON.stringify(context.activity.value) as any,
  };

  await context.sendActivity(Activity.fromObject({
      value: { body: adcdinkrsp, status: 200 } as InvokeResponse,
      type: ActivityTypes.InvokeResponse
  }));
})
agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${JSON.stringify(context.activity.text)}`)
  state.setValue('conversation.counter', counter)
})
startServer(agent)
