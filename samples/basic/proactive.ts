import { ActivityHandler, AgentApplication, AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, MemoryStorage, TurnContext, TurnState, Request } from '@microsoft/agents-hosting'
import express, { Response } from 'express'
import pjson from '@microsoft/agents-hosting/package.json'
import { ConversationReference } from '@microsoft/agents-activity'

const echo = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to proactive sample, send a GET request to http://localhost:3978/api/proactive to see the proactive message feature in action.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
  const conversationReference = context.activity.getConversationReference()
  await context.sendActivity(JSON.stringify(conversationReference, null, 2))
})

const startServer = (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfiguration?: AuthConfiguration) => {
  const authConfig: AuthConfiguration = authConfiguration ?? loadAuthConfigFromEnv()
  let adapter: CloudAdapter
  if (agent instanceof ActivityHandler || !agent.adapter) {
    adapter = new CloudAdapter()
  } else {
    adapter = agent.adapter as CloudAdapter
  }

  const headerPropagation = (agent as AgentApplication<TurnState<any, any>>)?.options.headerPropagation

  const server = express()
  server.use(express.json())

  server.get('/api/proactive', async (req: Request, res: Response) => {
    const conversationReference: ConversationReference = {
      activityId: '',
      user: {
        id: '',
        name: '',
        aadObjectId: ''
      },
      agent: {
        id: '',
        name: ''
      },
      conversation: {
        conversationType: '',
        tenantId: '',
        id: ''
      },
      channelId: '',
      locale: '',
      serviceUrl: ''
    }
    const msg = 'This is a proactive message sent from the server!' + Date.now()
    await adapter.continueConversation(conversationReference, async (context) => {
      await context.sendActivity(msg)
    })
    res.status(200).send(msg)
  })

  server.post('/api/messages', authorizeJWT(authConfig), (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context)
    , headerPropagation)
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    console.log(`\nServer listening to port ${port} on sdk ${pjson.version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
}

startServer(echo)
