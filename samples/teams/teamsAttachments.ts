import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, M365AttachmentDownloader } from '@microsoft/agents-hosting'

const storedFilesKey = 'storedFiles' as const

const agent = new AgentApplication({
  fileDownloaders: [new M365AttachmentDownloader(storedFilesKey)]
})

agent.onConversationUpdate('membersAdded', async (context) => {
  await context.sendActivity('Welcome to the Attachment sample, send a message with an attachment to see the feature in action.')
})

agent.onActivity('message', async (context, state) => {
  const files = (state.getValue(storedFilesKey) as unknown[] | undefined) ?? []
  await context.sendActivity(`You sent ${files.length} file(s)`)
})

startServer(agent)
