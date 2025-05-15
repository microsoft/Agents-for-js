import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication } from '@microsoft/agents-hosting'
import { TeamsAttachmentDownloader } from '@microsoft/agents-hosting-extensions-teams'

const agent = new AgentApplication({
  fileDownloaders: [new TeamsAttachmentDownloader()]
})

agent.conversationUpdate('membersAdded', async (context) => {
  await context.sendActivity('Welcome to the Attachment sample, send a message with an attachment to see the echo feature in action.')
})

agent.activity('message', async (context, state) => {
  const files = state.temp.inputFiles
  await context.sendActivity(`You sent ${files.length} file(s)`)
})

startServer(agent)
