import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, FileStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const echo = new AgentApplication<TurnState>({ storage: new FileStorage('__state') })
type MyState = {
  name: string
  age: number
}
const myState: MyState = {
  name: 'rido',
  age: 30,
}

echo.onConversationUpdate('membersAdded', async (context: TurnContext, state: TurnState) => {
  state.setValue('user.myState', myState)
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const myState: MyState = state.getValue('user.myState')
  myState.age++
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
  state.setValue('user.myState', myState)
  await context.sendActivity(`state: ${JSON.stringify(myState, null, 2)}`)
})

startServer(echo)
