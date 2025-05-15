import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, AttachmentDownloader } from '@microsoft/agents-hosting'

const agent = new AgentApplication({
  fileDownloaders: [new AttachmentDownloader()],
})

agent.conversationUpdate('membersAdded', async (context) => {
  await context.sendActivity('Welcome to the Attachment sample, send a message with an attachment to see the echo feature in action.')
})

agent.activity('message', async (context, state) => {
  const files = state.temp.inputFiles
  await context.sendActivity(`You sent ${files.length} file(s)`)
})

startServer(agent)
