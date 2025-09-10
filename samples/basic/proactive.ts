import { AgentApplication, AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import express, { Response, Request } from 'express'
import pjson from '@microsoft/agents-hosting/package.json'
import { Activity, ConversationReference } from '@microsoft/agents-activity'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity(`Welcome to proactive sample, conversation id ${context.activity.conversation?.id}`)
})
app.onMessage('/diag', async (context: TurnContext) => {
  await context.sendActivity(`Diagnostic information: ${JSON.stringify(context.activity.getConversationReference(), null, 2)}`)
})
app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  const channelId = context.activity.channelId
  let proactiveUrl = ''
  switch (channelId) {
    case 'webchat':
      proactiveUrl = `http://localhost:3978/api/push-webchat?cid=${context.activity.conversation?.id}&rid=${context.activity.recipient?.id}`
      break
    case 'msteams':
      proactiveUrl = `http://localhost:3978/api/push-teams?uid=${context.activity.from?.aadObjectId}`
      break
  }
  await context.sendActivity(`Welcome to proactive sample, send a GET request to  
    [${proactiveUrl}](${proactiveUrl}) 
    to see the proactive message feature in action.`)
  state.setValue('conversation.counter', counter)
})

const startServer = (agent: AgentApplication<TurnState<any, any>>, authConfiguration?: AuthConfiguration) => {
  const authConfig: AuthConfiguration = authConfiguration ?? loadAuthConfigFromEnv()
  let adapter: CloudAdapter
  if (!agent.adapter) {
    adapter = new CloudAdapter()
  } else {
    adapter = agent.adapter as CloudAdapter
  }

  const server = express()
  server.use(express.json())

  server.get('/api/push-teams', async (req: Request, res: Response) => {
    const uid = req.query.uid as string
    const msg = 'This is a proactive message sent from the server. timestamp ' + Date.now()
    const channelId = 'msteams'
    const serviceUrl = `https://smba.trafficmanager.net/amer/${authConfig.tenantId}/`
    const activity = Activity.fromObject({ type: 'message', text: msg, channelId, recipient: { id: ' ' }, serviceUrl })
    await adapter.createConversationAsync(authConfig.clientId, channelId, serviceUrl, 'https://api.botframework.com', {
      agent: {
        id: ' ',
        name: ''
      },
      channelData: { },
      isGroup: false,
      members: [{ name: '', id: uid }],
      tenantId: authConfig.tenantId,
      activity
    },
    async (context) => {
      const conversationReference = context.activity.getConversationReference()
      await adapter.continueConversation(conversationReference, async (context) => {
        await context.sendActivity(activity)
      })
    })
    res.status(200).send(msg)
  })

  server.get('/api/push-webchat', async (req: Request, res: Response) => {
    const conversationId = req.query.cid as string
    const recipientId = req.query.rid as string
    if (!conversationId) {
      res.status(400).send('Missing conversationId query parameter')
      return
    }
    const conversationReference: ConversationReference = {
      agent: { id: recipientId },
      conversation: {
        id: conversationId
      },
      channelId: 'webchat',
      serviceUrl: 'https://webchat.botframework.com/'
    }
    const msg = 'This is a proactive message sent from the server. timestamp ' + Date.now()
    await adapter.continueConversation(conversationReference, async (context) => {
      await context.sendActivity(msg)
    })
    res.status(200).send(msg)
  })

  server.post('/api/messages', authorizeJWT(authConfig), (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context))
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    console.log(`\nServer listening to port ${port} on sdk ${pjson.version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
}

startServer(app)
