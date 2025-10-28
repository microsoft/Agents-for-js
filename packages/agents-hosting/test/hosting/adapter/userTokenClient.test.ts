import { afterEach, beforeEach, describe, it } from 'node:test'
import { AuthConfiguration, CloudAdapter, MsalConnectionManager, Request, UserTokenClient, TurnContext } from '../../../src'
import sinon, { SinonSandbox } from 'sinon'
import { Activity, ActivityTypes, DeliveryModes } from '@microsoft/agents-activity'
import { ConnectorClient } from '../../../src/connector-client/connectorClient'
import { Response } from 'express'

describe('userTokenClient', function () {
  let sandbox: SinonSandbox
  let req: Request
  let res: Partial<Response>

  const authentication: AuthConfiguration = {
    tenantId: 'tenantId',
    clientId: 'clientId',
    clientSecret: 'clientSecret',
    issuers: ['issuers']
  }

  const mockConnectorClient = sinon.createStubInstance(ConnectorClient)
  const mockConnectionManager = sinon.createStubInstance(MsalConnectionManager)
  const mockUserTokenClient = sinon.createStubInstance(UserTokenClient)
  const cloudAdapter = new CloudAdapter(authentication);
  (cloudAdapter as any).connectionManager = mockConnectionManager

  sinon.stub(cloudAdapter as any, 'createConnectorClient').returns(mockConnectorClient)
  const createWithScopeSpy = sinon.stub(UserTokenClient, 'createClientWithScope').resolves(mockUserTokenClient)
  sinon.stub(cloudAdapter as any, 'createConnectorClientWithIdentity').returns(mockConnectorClient)
  const fromObjectStub = sinon.stub(Activity, 'fromObject')

  beforeEach(function () {
    sandbox = sinon.createSandbox({ useFakeTimers: true })
    req = {
      headers: {},
      body: {}
    }
    res = {
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

  describe('user token API endpoints', function () {
    it('Should call the default endpoint if env is not set', async function () {
      const activity = createActivity(ActivityTypes.Message)
      const logic = async (context: TurnContext) => {
        await context.sendActivity(Activity.fromObject(activity))
      }

      fromObjectStub.returns(activity)

      await cloudAdapter.process(req as Request, res as Response, logic)
      sinon.assert.calledWith(createWithScopeSpy, 'https://api.botframework.com')
    })

    it('Should call the default custom endpoint if env is set', async function () {
      process.env.TOKEN_SERVICE_ENDPOINT = 'https://europe.api.botframework.com'

      const activity = createActivity(ActivityTypes.Message)
      const logic = async (context: TurnContext) => {
        await context.sendActivity(Activity.fromObject(activity))
      }

      fromObjectStub.returns(activity)

      await cloudAdapter.process(req as Request, res as Response, logic)
      sinon.assert.calledWith(createWithScopeSpy, 'https://europe.api.botframework.com')
      delete process.env.TOKEN_SERVICE_ENDPOINT
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
  activity.deliveryMode = DeliveryModes.Normal
  activity.text = 'test-message'

  return activity
}
