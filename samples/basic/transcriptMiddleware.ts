import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, CloudAdapter, loadAuthConfigFromEnv, TranscriptLogger, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity } from '@microsoft/agents-activity'

class TestLogger implements TranscriptLogger {
  transcripts: Activity[] = []

  logActivity (activity: any): void {
    this.transcripts.push(activity)
  }

  getTranscripts (): Activity[] {
    return this.transcripts || []
  }

  deleteTranscript (): void {
    this.transcripts = []
  }
}

const logger: TestLogger = new TestLogger()
const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const agent = new AgentApplication({ adapter, transcriptLogger: logger })

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the TranscriptMiddleware sample, send "list" to see the logged transcripts and "delete" to clean up the list.')
})

agent.onMessage('list', async (context: TurnContext) => {
  const transcripts = logger.getTranscripts()
  await context.sendActivity('This is the list of logged transcripts:')
  for (const activity of transcripts) {
    await context.sendActivity(`Type: ${activity.type}, Text: ${activity.text || 'No text'}`)
  }
})

agent.onMessage('delete', async (context: TurnContext) => {
  logger.deleteTranscript()
  await context.sendActivity('Transcripts deleted!')
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})

startServer(agent)
