import { strict as assert, strict } from 'assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AuthConfiguration, CloudAdapter, INVOKE_RESPONSE_KEY, MsalConnectionManager, Request, UserTokenClient, TurnContext } from '../../../src'
import sinon, { SinonSandbox } from 'sinon'
import { Activity, ActivityTypes, ConversationReference, DeliveryModes, RoleTypes } from '@microsoft/agents-activity'
import { ConnectorClient } from '../../../src/connector-client/connectorClient'
import { Response } from 'express'

describe('CloudAdapter', function () {
  let sandbox: SinonSandbox
  let mockConnectorClient: sinon.SinonStubbedInstance<ConnectorClient>
  let mockConnectionManager: sinon.SinonStubbedInstance<MsalConnectionManager>
  let mockUserTokenClient: sinon.SinonStubbedInstance<UserTokenClient>
  let cloudAdapter: CloudAdapter
  let req: Request
  let res: Partial<Response>
  let createConnectorClientWithIdentitySpy: sinon.SinonStub
  let createUserTokenClientSpy: sinon.SinonStub

  const authentication: AuthConfiguration = {
    tenantId: 'tenantId',
    clientId: 'clientId',
    clientSecret: 'clientSecret',
    issuers: ['issuers']
  }

  beforeEach(function () {
    sandbox = sinon.createSandbox({ useFakeTimers: true })
    mockConnectorClient = sinon.createStubInstance(ConnectorClient)
    mockConnectionManager = sinon.createStubInstance(MsalConnectionManager)
    mockUserTokenClient = sinon.createStubInstance(UserTokenClient)
    cloudAdapter = new CloudAdapter(authentication);
    (cloudAdapter as any).connectionManager = mockConnectionManager

    sinon.stub(cloudAdapter as any, 'createConnectorClient').returns(mockConnectorClient)
    createUserTokenClientSpy = sinon.stub(cloudAdapter as any, 'createUserTokenClient').returns(mockUserTokenClient)
    createConnectorClientWithIdentitySpy = sinon.stub(cloudAdapter as any, 'createConnectorClientWithIdentity').returns(mockConnectorClient)

    req = {
      headers: {},
      body: {}
    }
    res = {
      headersSent: false,
      writableEnded: false,
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis(),
      setHeader: sinon.stub().returnsThis()
    }
  })

  afterEach(function () {
    if (sandbox) {
      sandbox.restore()
    }
  })

  describe('constructor', function () {
    it('succeeds', function () {
      const ca = new CloudAdapter(authentication)
      strict.notEqual(ca, undefined)
    })

    it('passes a single legacy scope string to agentic user token acquisition', async function () {
      createConnectorClientWithIdentitySpy.restore()

      const connectorClient = {} as ConnectorClient
      const createClientStub = sinon.stub(ConnectorClient, 'createClientWithToken').returns(connectorClient)
      const tokenProvider = {
        connectionSettings: {
          scope: 'https://api.botframework.com/.default'
        },
        getAgenticUserToken: sinon.stub().resolves('agentic-token'),
        getAgenticInstanceToken: sinon.stub()
      }
      mockConnectionManager.getTokenProviderFromActivity.returns(tokenProvider as any)

      const activity = {
        serviceUrl: 'https://service.example',
        recipient: { role: RoleTypes.AgenticUser },
        isAgenticRequest: () => true,
        getAgenticInstanceId: () => 'instance-id',
        getAgenticUser: () => 'user-id',
        getAgenticTenantId: () => 'tenant-id'
      } as any

      const result = await (cloudAdapter as any).createConnectorClientWithIdentity({ aud: 'app-id' }, activity)

      assert.strictEqual(result, connectorClient)
      sinon.assert.calledOnceWithExactly(tokenProvider.getAgenticUserToken, 'tenant-id', 'instance-id', 'user-id', ['https://api.botframework.com/.default'])
      sinon.assert.calledOnceWithExactly(createClientStub, 'https://service.example', 'agentic-token', undefined)
      createClientStub.restore()
    })
  })

  describe('process', function () {
    it('Should call end with status 200 and a body on invoke activity', async function () {
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(createActivity(ActivityTypes.Invoke))

      const logic = async (context: TurnContext) => {
        context.turnState.set(INVOKE_RESPONSE_KEY, {
          type: ActivityTypes.InvokeResponse,
          value: {
            status: 200,
            body: 'invokeResponse',
          },
        })
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.calledOnceWithExactly((res as any).status, 200)
      sinon.assert.calledOnceWithExactly((res as any).setHeader, 'content-type', 'application/json')
      sinon.assert.calledOnce((res as any).send)
      sinon.assert.calledOnce((res as any).end)
      sinon.assert.calledOnce(createConnectorClientWithIdentitySpy)

      stubfromObject.restore()
    })

    it('Should call end with status 200 and no body on invokeResponse activity', async function () {
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(createActivity(ActivityTypes.InvokeResponse))

      const logic = async (context: TurnContext) => {
        context.turnState.set(INVOKE_RESPONSE_KEY, {
          type: ActivityTypes.InvokeResponse,
          value: {
            status: 200,
            body: 'invokeResponse',
          },
        })
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.calledOnceWithExactly((res as any).status, 200)
      sinon.assert.calledOnceWithExactly((res as any).setHeader, 'content-type', 'application/json')
      sinon.assert.notCalled((res as any).send)
      sinon.assert.calledOnce(createConnectorClientWithIdentitySpy)

      stubfromObject.restore()
    })

    it('Should call end with status 501 on invoke activity with no invokeResponse', async function () {
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(createActivity(ActivityTypes.Invoke))

      const logic = async (context: TurnContext) => {
        // No invokeResponse set in turnState
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.calledOnceWithExactly((res as any).status, 501)
      sinon.assert.calledOnceWithExactly((res as any).setHeader, 'content-type', 'application/json')
      sinon.assert.notCalled((res as any).send)
      sinon.assert.calledOnce(createConnectorClientWithIdentitySpy)

      stubfromObject.restore()
    })

    it('Should call end with status 200 on expectReplies without connectorClient', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.deliveryMode = DeliveryModes.ExpectReplies
      activity.text = 'test-message'
      activity.serviceUrl = undefined // Simulate no serviceUrl

      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      const logic = async (context: TurnContext) => {
        await context.sendActivity(activity)
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.calledOnceWithExactly((res as any).status, 200)
      sinon.assert.calledOnceWithExactly((res as any).setHeader, 'content-type', 'application/json')
      sinon.assert.calledOnceWithExactly((res as any).send, { activities: [activity] })
      sinon.assert.notCalled(createConnectorClientWithIdentitySpy) // No connector client created for ExpectReplies without serviceUrl

      stubfromObject.restore()
    })

    it('Should call end with status 200 on normal delivery mode', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.deliveryMode = DeliveryModes.Normal
      activity.text = 'test-message'

      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      const logic = async (context: TurnContext) => {
        await context.sendActivity(activity)
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.calledOnceWithExactly((res as any).status, 200)
      sinon.assert.notCalled((res as any).setHeader)
      sinon.assert.notCalled((res as any).send)
      sinon.assert.calledOnce(createConnectorClientWithIdentitySpy)

      stubfromObject.restore()
    })

    it('Should not touch the response after logic already committed it', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.deliveryMode = DeliveryModes.ExpectReplies
      activity.text = 'test-message'
      activity.serviceUrl = undefined

      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      const logic = async (_context: TurnContext) => {
        ;(res as any).headersSent = true
        ;(res as any).writableEnded = true
      }

      await cloudAdapter.process(req as Request, res as Response, logic)

      sinon.assert.notCalled((res as any).status)
      sinon.assert.notCalled((res as any).setHeader)
      sinon.assert.notCalled((res as any).send)
      sinon.assert.notCalled((res as any).end)
      sinon.assert.notCalled(createConnectorClientWithIdentitySpy)

      stubfromObject.restore()
    })

    it('Should not apply agentic headers for normal requests', async function () {
      const activity = createActivity(ActivityTypes.Message)
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName('Valid Agent_1')

      await cloudAdapter.process(req as Request, res as Response, async () => {})

      const connectorHeaders = createConnectorClientWithIdentitySpy.firstCall.args[2]
      const userTokenHeaders = createUserTokenClientSpy.firstCall.args[4]

      assert.strictEqual(connectorHeaders.outgoing.AgentRegistrar, undefined)
      assert.strictEqual(connectorHeaders.outgoing.AgentID, undefined)
      assert.strictEqual(connectorHeaders.outgoing.AgentName, undefined)
      assert.strictEqual(connectorHeaders.outgoing['Agent-Referrer'], undefined)
      assert.strictEqual(connectorHeaders.outgoing['User-Agent'], undefined)

      assert.strictEqual(userTokenHeaders.outgoing.AgentRegistrar, undefined)
      assert.strictEqual(userTokenHeaders.outgoing.AgentID, undefined)
      assert.strictEqual(userTokenHeaders.outgoing.AgentName, undefined)
      assert.strictEqual(userTokenHeaders.outgoing['Agent-Referrer'], undefined)
      assert.strictEqual(userTokenHeaders.outgoing['User-Agent'], undefined)

      stubfromObject.restore()
    })

    it('Should prefer agenticAppId when applying M365 agent headers for agentic requests', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.recipient = {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser',
        agenticAppId: 'agentic-app-id'
      }
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName('Valid Agent_1')

      await cloudAdapter.process(req as Request, res as Response, async () => {})

      const connectorHeaders = createConnectorClientWithIdentitySpy.firstCall.args[2]

      assert.strictEqual(connectorHeaders.outgoing.AgentID, 'agentic-app-id')
      assert.strictEqual(connectorHeaders.outgoing.AgentName, 'Valid Agent_1')
      assert.strictEqual(connectorHeaders.outgoing.AgentRegistrar, 'A365')
      assert.strictEqual(connectorHeaders.outgoing['Agent-Referrer'], 'test-channel')
      assert.strictEqual(connectorHeaders.outgoing['User-Agent'], undefined)
      sinon.assert.notCalled(createUserTokenClientSpy)

      stubfromObject.restore()
    })

    it('Should trim agent name when applying agent headers', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.recipient = {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser',
        agenticAppId: 'agentic-app-id'
      }
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName('  Valid Agent_1  ')

      await cloudAdapter.process(req as Request, res as Response, async () => {})

      const connectorHeaders = createConnectorClientWithIdentitySpy.firstCall.args[2]

      assert.strictEqual(connectorHeaders.outgoing.AgentID, 'agentic-app-id')
      assert.strictEqual(connectorHeaders.outgoing.AgentName, 'Valid Agent_1')
      assert.strictEqual(connectorHeaders.outgoing.AgentRegistrar, 'A365')
      assert.strictEqual(connectorHeaders.outgoing['Agent-Referrer'], 'test-channel')

      stubfromObject.restore()
    })

    it('Should use default agent name when adapter is configured without one', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.recipient = {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser',
        agenticAppId: 'agentic-app-id'
      }
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName(undefined)

      await cloudAdapter.process(req as Request, res as Response, async () => {})

      const connectorHeaders = createConnectorClientWithIdentitySpy.firstCall.args[2]

      assert.strictEqual(connectorHeaders.outgoing.AgentID, 'agentic-app-id')
      assert.strictEqual(connectorHeaders.outgoing.AgentName, 'Agents-SDK-JS')
      assert.strictEqual(connectorHeaders.outgoing.AgentRegistrar, 'A365')
      assert.strictEqual(connectorHeaders.outgoing['Agent-Referrer'], 'test-channel')

      stubfromObject.restore()
    })

    it('Should reject invalid agent name when processing a request', async function () {
      const activity = createActivity(ActivityTypes.Message)
      activity.recipient = {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser',
        agenticAppId: 'agentic-app-id'
      }
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName('Bad!Name')

      await assert.rejects(async () => {
        await cloudAdapter.process(req as Request, res as Response, async () => {})
      })

      stubfromObject.restore()
    })

    it('Should ignore invalid agent name for non-agentic requests', async function () {
      const activity = createActivity(ActivityTypes.Message)
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      cloudAdapter.setAgentName('Bad!Name')

      await cloudAdapter.process(req as Request, res as Response, async () => {})

      sinon.assert.calledOnce(createConnectorClientWithIdentitySpy)
      sinon.assert.calledOnce(createUserTokenClientSpy)
      stubfromObject.restore()
    })

    it('Should reject request processing when no agent id can be resolved', async function () {
      const adapterWithoutClientId = new CloudAdapter({
        tenantId: 'tenantId',
        clientSecret: 'clientSecret',
        issuers: ['issuers']
      })
      const localCreateUserTokenClientSpy = sinon.stub(adapterWithoutClientId as any, 'createUserTokenClient').returns(mockUserTokenClient)
      const localCreateConnectorClientSpy = sinon.stub(adapterWithoutClientId as any, 'createConnectorClientWithIdentity').returns(mockConnectorClient)
      const activity = createActivity(ActivityTypes.Message)
      activity.recipient = {
        id: 'test-bot-id',
        name: 'test-bot-name',
        role: 'agenticUser'
      }
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      await assert.rejects(async () => {
        await adapterWithoutClientId.process(req as Request, res as Response, async () => {})
      }, {
        name: 'Error',
        message: '[-120620] - Agent ID is required to apply outbound agent headers - https://aka.ms/M365AgentsErrorCodesJS/#-120620'
      })

      sinon.assert.notCalled(localCreateConnectorClientSpy)
      sinon.assert.notCalled(localCreateUserTokenClientSpy)
      stubfromObject.restore()
    })

    it('Should process non-agentic requests without a client id', async function () {
      const adapterWithoutClientId = new CloudAdapter({
        tenantId: 'tenantId',
        clientSecret: 'clientSecret',
        issuers: ['issuers']
      })
      const localCreateUserTokenClientSpy = sinon.stub(adapterWithoutClientId as any, 'createUserTokenClient').returns(mockUserTokenClient)
      const localCreateConnectorClientSpy = sinon.stub(adapterWithoutClientId as any, 'createConnectorClientWithIdentity').returns(mockConnectorClient)
      const activity = createActivity(ActivityTypes.Message)
      const stubfromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      await adapterWithoutClientId.process(req as Request, res as Response, async () => {})

      sinon.assert.calledOnce(localCreateConnectorClientSpy)
      sinon.assert.calledOnce(localCreateUserTokenClientSpy)
      stubfromObject.restore()
    })
  })

  describe('sendActivities', function () {
    it('throws for bad args', async function () {
      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(undefined, []), {
        name: 'TypeError',
        message: '[-120090] - context parameter required - https://aka.ms/M365AgentsErrorCodesJS/#-120090'
      })

      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(new TurnContext(cloudAdapter), undefined), {
        name: 'TypeError',
        message: '[-120070] - activities parameter required - https://aka.ms/M365AgentsErrorCodesJS/#-120070'
      })

      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(new TurnContext(cloudAdapter), []), {
        name: 'Error',
        message: '[-120060] - Expecting one or more activities, but the array was empty. - https://aka.ms/M365AgentsErrorCodesJS/#-120060'
      })
    })

    it('replies to an activity', async function () {
      // @ts-expect-error
      const context = new TurnContext(cloudAdapter)

      const activity: Activity = Activity.fromObject(
        {
          type: ActivityTypes.Message,
          conversation: {
            id: 'conversationId'
          },
          replyToId: 'replyToId',
          serviceUrl: 'serviceUrl'
        }
      )

      context.turnState.set(cloudAdapter.ConnectorClientKey, mockConnectorClient)
      mockConnectorClient.replyToActivity.resolves({ id: 'id' })

      assert.deepStrictEqual(await cloudAdapter.sendActivities(context, [activity]), [{ id: 'id' }])

      sandbox.verify()
    })

    it('sends an activity to a conversation', async function () {
      // @ts-expect-error
      const context = new TurnContext(cloudAdapter)

      const activity: Activity = Activity.fromObject(
        {
          type: ActivityTypes.Message,
          conversation: {
            id: 'conversationId'
          },
          serviceUrl: 'serviceUrl'
        }
      )
      mockConnectorClient.sendToConversation.resolves({ id: 'id' })

      context.turnState.set(cloudAdapter.ConnectorClientKey, mockConnectorClient)

      assert.deepStrictEqual(await cloudAdapter.sendActivities(context, [activity]), [{ id: 'id' }])

      sandbox.verify()
    })
  })

  describe('continueConversation', function () {
    const bootstrap = () => {
      const logic = sinon.fake((context) => {
        sinon.assert.match(
          context,
          sinon.match({
            activity: {
              name: 'ContinueConversation',
            },
          })
        )
      })

      return {
        logic,
        verify: () => {
          sandbox.verify()
          sinon.assert.called(logic)
        },
      }
    }

    it('works with a botId', async function () {
      const conversationReference: ConversationReference = {
        activityId: '1234',
        user: { id: 'user1', name: 'User' },
        agent: { id: 'bot1', name: 'Bot' },
        conversation: { id: 'conversation1' },
        channelId: 'channel123',
        locale: 'en-US',
        serviceUrl: 'http://example.com'
      }

      const { logic, verify } = bootstrap()

      // @ts-expect-error
      await cloudAdapter.continueConversation(authentication.clientId, conversationReference, logic)

      verify()
    })

    it('throws error', async function () {
      const conversationReference: ConversationReference = {
        activityId: '1234',
        user: { id: 'user1', name: 'User' },
        bot: { id: 'bot1', name: 'Bot' },
        // @ts-expect-error
        conversation: null,
        channelId: 'channel123',
        locale: 'en-US',
        serviceUrl: 'http://example.com'
      }

      const { logic } = bootstrap()

      const error = new Error('[-120130] - continueConversation: Invalid conversation reference object - https://aka.ms/M365AgentsErrorCodesJS/#-120130')

      await assert.rejects(
        cloudAdapter.continueConversation(authentication.clientId as string, conversationReference, (context) => {
          logic(context)

          throw error
        }),
        error
      )
    })
  })

  describe('createCreateActivity', () => {
    it('sets from to members[0] when members are present', () => {
      const params = {
        members: [{ id: 'user-123', name: 'Test User' }],
        agent: { id: 'bot-456', role: 'bot' },
        tenantId: 'tenant-1',
      }
      const activity = (cloudAdapter as any).createCreateActivity('conv-1', 'msteams', 'https://svc/', params)
      assert.equal(activity.from?.id, 'user-123')
    })

    it('falls back to agent when members is absent', () => {
      const params = {
        agent: { id: 'bot-456', role: 'bot' },
        isGroup: true,
        channelData: { channel: { id: '19:abc@thread.tacv2' } },
      }
      const activity = (cloudAdapter as any).createCreateActivity('conv-1', 'msteams', 'https://svc/', params)
      assert.equal(activity.from?.id, 'bot-456')
    })

    it('sets recipient to agent', () => {
      const params = {
        members: [{ id: 'user-123' }],
        agent: { id: 'bot-456', role: 'bot' },
      }
      const activity = (cloudAdapter as any).createCreateActivity('conv-1', 'msteams', 'https://svc/', params)
      assert.equal(activity.recipient?.id, 'bot-456')
    })
  })
})

function createActivity (type: ActivityTypes) {
  const activity: Activity = new Activity(type)
  activity.conversation = { id: 'test-conversation-id' }
  activity.serviceUrl = 'http://test-service-url'
  activity.channelId = 'test-channel'
  activity.from = { id: 'test-user-id', name: 'test-user-name' }
  activity.recipient = { id: 'test-bot-id', name: 'test-bot-name' }
  return activity
}
