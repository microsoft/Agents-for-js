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
  state.setValue('conversation.counter', counter)
  await context.sendActivity(`Welcome to proactive sample, send a GET request to  
        [Conversation Id: ${context.activity.conversation?.id.substring(0, 10)}..](http://localhost:3978/api/push?cid=${context.activity.conversation?.id}&aid=${context.activity.recipient?.id}&chid=${context.activity.channelId}) 
        to see the proactive message feature in action.`)
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

  server.get('/api/proactive', async (req: Request, res: Response) => {
    const conversationId = req.query.cid as string
    if (!conversationId) {
      res.status(400).send('Missing conversationId query parameter')
      return
    }
    const conversationReference: ConversationReference = {
      agent: {},
      conversation: {
        id: conversationId
      },
      channelId: 'msteams',
      serviceUrl: `https://smba.trafficmanager.net/amer/${authConfig.tenantId}/`
    }
    const msg = 'This is a proactive message sent from the server. timestamp' + Date.now()
    await adapter.continueConversation(conversationReference, async (context) => {
      await context.sendActivity(msg)
    })
    res.status(200).send(msg)
  })

  server.get('/api/push', async (req: Request, res: Response) => {
    const agentId = req.query.aid as string
    const channelId = req.query.chid as string || 'webchat'
    const msg = 'This is a proactive message sent from the server. timestamp' + Date.now()
    const activity = Activity.fromObject({ type: 'message', text: msg, channelId, recipient: { id: agentId } })
    const serviceUrl = channelId === 'webchat' ? 'https://webchat.botframework.com/' : `https://smba.trafficmanager.net/amer/${authConfig.tenantId}/`

    await adapter.createConversationAsync(authConfig.clientId, channelId, serviceUrl, 'https://api.botframework.com', {
      agent: {
        id: agentId,
        name: 'ridobot'
      },
      channelData: { userType: 'bot' },
      isGroup: false,
      members: [{ name: 'rido', id: '330e28be-23d7-4c85-8cec-cd3a30dcd01e' }],
      tenantId: authConfig.tenantId,
      activity
    },
    async (context) => {
      const conversationReference = context.activity.getConversationReference()
      await adapter.continueConversation(conversationReference, async (context) => {
        await context.sendActivity(activity)
      })
    })

    // const conversationReference: ConversationReference = {
    //   agent: {
    //     id: agentId,
    //     name: ''
    //   },
    //   user: {
    //     id: '330e28be-23d7-4c85-8cec-cd3a30dcd01e',
    //     name: ''
    //   },
    //   conversation: {
    //     id: conversationId
    //   },
    //   channelId,
    //   serviceUrl
    // }
    // console.log('Conversation Reference:', conversationReference)
    // const msg = 'This is a proactive message sent from the server. timestamp' + Date.now()
    // await adapter.continueConversation(conversationReference, async (context) => {
    //   await context.sendActivity(msg)
    // })
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
