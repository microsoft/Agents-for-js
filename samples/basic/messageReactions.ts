import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Message Reactions sample! Send a message and then add a reaction to it.')
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''

  state.setValue('conversation.lastMessage', text)

  await context.sendActivity(`I received your message: "${text}". Try adding a reaction to this message!`)
})

app.onMessageReactionAdded(async (context: TurnContext, state: TurnState) => {
  const reactionsAdded = context.activity.reactionsAdded
  if (reactionsAdded && reactionsAdded.length > 0) {
    const reactionType = reactionsAdded[0].type
    const lastMessage = state.getValue('conversation.lastMessage') || 'a message'
    await context.sendActivity(`Thanks for adding a "${reactionType}" reaction to "${lastMessage}"!`)
  }
})

app.onMessageReactionRemoved(async (context: TurnContext, state: TurnState) => {
  const reactionsRemoved = context.activity.reactionsRemoved
  if (reactionsRemoved && reactionsRemoved.length > 0) {
    const reactionType = reactionsRemoved[0].type
    await context.sendActivity(`I see you removed your "${reactionType}" reaction.`)
  }
})

startServer(app)
