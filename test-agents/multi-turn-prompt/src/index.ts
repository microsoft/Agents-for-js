import express, { Response } from 'express'
import { DialogHandler } from './dialogs/dialogBot'
import { UserProfileDialog } from './dialogs/userProfileDialog'
import { CloudAdapter, authorizeJWT, loadAuthConfigFromEnv, UserState, ConversationState, MemoryStorage, Request } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'

const authConfig = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)

// Define the state store for your agent. See https://aka.ms/about-bot-state to learn more about using MemoryStorage.
// An Agent requires a state storage system to persist the dialog and user state between messages.
const memoryStorage = new MemoryStorage()

// Create conversation and user state with in-memory storage provider.
const conversationState = new ConversationState(memoryStorage)
const userState = new UserState(memoryStorage)

// Create the main dialog.
const dialog = new UserProfileDialog(userState)

// Create the agent's main handler.
const myAgent = new DialogHandler(conversationState, userState, dialog)

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  // console.log(req.body)
  // console.log('req.user', req.user)
  await adapter.process(req, res, async (context) => await myAgent.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
}).on('error', console.error)
