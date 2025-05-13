import { AdaptiveCardActionExecuteResponseType, AgentApplication, CloudAdapter, DefaultConversationState, loadAuthConfigFromEnv, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

interface MyUserState {
  numMessages: number
}

const adapter = new CloudAdapter(loadAuthConfigFromEnv())
const app = new AgentApplication<TurnState<DefaultConversationState, MyUserState>>({
  // storage: new FileStorage('__state/'),
  adapter,
  startTypingTimer: false,
  longRunningMessages: false,
  adaptiveCardsOptions: {
    actionSubmitFilter: 'myFilter',
    actionExecuteResponseType: AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL
  }
})

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

app.activity('message', async (context: TurnContext, state: TurnState<DefaultConversationState, MyUserState>) => {
  const numMessages = state.user.numMessages || 0
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  // await context.sendActivity(`You said1: ${context.activity.text}`)
  await sleep(3000)
  await context.sendActivity(`You said [${numMessages}]: ${context.activity.text}`)
  state.user.numMessages = numMessages + 1
})

startServer(app)
