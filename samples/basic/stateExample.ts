import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, TurnState, FileStorage } from '@microsoft/agents-hosting'

interface GlobalData {
  totalMessages: {
    counter: number
  },
  totalUsers: {
    numUsers: number,
    lastUser: string
  }
}

interface LocalData {
  numMessages: number
}

const echo = new AgentApplication<TurnState<GlobalData, LocalData>>({ storage: new FileStorage('__state/') })
const initState = (state: TurnState<GlobalData, LocalData>) => {
  if (!state.conversation.totalMessages) {
    state.conversation.totalMessages = { counter: 0 }
  }
  if (!state.conversation.totalUsers) {
    state.conversation.totalUsers = { numUsers: 0, lastUser: '' }
  }
  if (!state.user.numMessages) {
    state.user.numMessages = 0
  }
}
echo.conversationUpdate('membersAdded', async (context, state) => {
  initState(state)
  state.conversation.totalMessages.counter++
  state.conversation.totalUsers.lastUser = context.activity.from!.id!
  state.conversation.totalUsers.numUsers++
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

echo.activity('message', async (context, state) => {
  initState(state)
  let counter: number = state.conversation.totalMessages.counter
  let userCounter: number = state.user.numMessages
  await context.sendActivity(`[${counter++}/${userCounter++}]You said: ${context.activity.text}`)
  state.conversation.totalMessages.counter = counter
  state.user.numMessages = userCounter
})
startServer(echo)
