import { strict as assert, strict } from 'assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { AuthConfiguration, CloudAdapter, TurnContext } from '../../../src'
import sinon, { SinonSandbox } from 'sinon'
import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity-schema'
import { ConnectorClient } from '../../../src/connector-client/connectorClient'

describe('CloudAdapter', function () {
  let sandbox: SinonSandbox
  let mockConnectorClient: sinon.SinonStubbedInstance<ConnectorClient>
  let cloudAdapter: CloudAdapter

  const authentication: AuthConfiguration = {
    tenantId: 'tenantId',
    clientId: 'clientId',
    clientSecret: 'clientSecret',
    issuers: ['issuers']
  }

  beforeEach(function () {
    sandbox = sinon.createSandbox({ useFakeTimers: true })
    mockConnectorClient = sinon.createStubInstance(ConnectorClient)
    cloudAdapter = new CloudAdapter(authentication);
    (cloudAdapter as any).connectorClient = mockConnectorClient
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
  })

  describe('sendActivities', function () {
    it('throws for bad args', async function () {
      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(undefined, []), {
        name: 'TypeError',
        message: '`context` parameter required'
      })

      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(new TurnContext(cloudAdapter), undefined), {
        name: 'TypeError',
        message: '`activities` parameter required'
      })

      // @ts-expect-error
      await assert.rejects(cloudAdapter.sendActivities(new TurnContext(cloudAdapter), []), {
        name: 'Error',
        message: 'Expecting one or more activities, but the array was empty.'
      })
    })

    it('delays activities', async function () {
      const resolved = sinon.fake()

      const promise = cloudAdapter
      // @ts-expect-error
        .sendActivities(new TurnContext(cloudAdapter), [
          Activity.fromObject(
            {
              type: 'delay',
              value: 2000
            }
          )
        ])
        .then(resolved)

      sandbox.clock.tick(1000)
      sinon.assert.notCalled(resolved)

      sandbox.clock.tick(1000)
      await promise

      sinon.assert.called(resolved)
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
      mockConnectorClient.replyToActivityAsync.resolves({ id: 'id' })

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
      mockConnectorClient.sendToConversationAsync.resolves({ id: 'id' })

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
        bot: { id: 'bot1', name: 'Bot' },
        conversation: { id: 'conversation1' },
        channelId: 'channel123',
        locale: 'en-US',
        serviceUrl: 'http://example.com'
      }

      const { logic, verify } = bootstrap()

      // @ts-expect-error
      await cloudAdapter.continueConversation(conversationReference, logic)

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

      const error = new Error('Invalid conversation reference object')

      await assert.rejects(
        cloudAdapter.continueConversation(conversationReference, (context) => {
          logic(context)

          throw error
        }),
        error
      )
    })
  })
})
