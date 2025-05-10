import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  console.log('Teams extension registered')

  tae.onMessageEdit(async (context: TurnContext, state: TurnState) => {
    console.log('Message edited:', context.activity.text)
    await context.sendActivity('I noticed you edited your message.')
  })

  tae.onMessageDelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message deleted')
    await context.sendActivity('I noticed you deleted a message.')
  })

  tae.onMessageUndelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message undeleted')
    await context.sendActivity('I noticed you undeleted a message.')
  })

  tae.onTeamsMembersAdded(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members added')
    await context.sendActivity('Welcome to the team!')
  })

  tae.onTeamsMembersRemoved(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members removed')
    await context.sendActivity('A member has left the team.')
  })
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''
  console.log('Received message:', text)

  state.setValue('user.lastMessage', text)

  await context.sendActivity(`I received your message in Teams: "${text}". Try adding a reaction!`)
})

app.onMessageReactionAdded(async (context: TurnContext, state: TurnState) => {
  const reactionsAdded = context.activity.reactionsAdded
  if (reactionsAdded && reactionsAdded.length > 0) {
    const reactionType = reactionsAdded[0].type
    console.log('Generic message reaction added:', reactionType)
    await context.sendActivity(`Thanks for adding a ${reactionType} reaction (non-Teams channel).`)
  }
})

app.onMessageReactionRemoved(async (context: TurnContext, state: TurnState) => {
  const reactionsRemoved = context.activity.reactionsRemoved
  if (reactionsRemoved && reactionsRemoved.length > 0) {
    const reactionType = reactionsRemoved[0].type
    console.log('Generic message reaction removed:', reactionType)
    await context.sendActivity(`You removed your ${reactionType} reaction (non-Teams channel).`)
  }
})

startServer(app)
