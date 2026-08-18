// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import * as sinon from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import {
  AdapterTraceDefinitions,
  AgentApplicationTraceDefinitions,
  AgentClientTraceDefinitions,
  AuthenticationTraceDefinitions,
  AuthorizationTraceDefinitions,
  ConnectorClientTraceDefinitions,
  ProactiveTraceDefinitions,
  StorageTraceDefinitions,
  TurnContextTraceDefinitions,
  UserTokenClientTraceDefinitions,
} from '../../src/observability/traces'
import { HostingMetrics } from '../../src/observability/metrics'

const duration = 123

function createSpan () {
  const attributes: Record<string, unknown> = {}
  const events: Array<{ name: string, attributes: Record<string, unknown> }> = []
  const links: Array<{ context: unknown }> = []
  const context = { traceId: 'trace-id', spanId: 'span-id' }

  return {
    attributes,
    events,
    links,
    setAttribute (name: string, value: unknown) {
      attributes[name] = value
    },
    setAttributes (values: Record<string, unknown>) {
      Object.assign(attributes, values)
    },
    addEvent (name: string, values: Record<string, unknown>) {
      events.push({ name, attributes: values })
    },
    addLink (link: { context: unknown }) {
      links.push(link)
    },
    spanContext () {
      return context
    },
  }
}

function endTrace (definition: any, record: Record<string, unknown>, error?: unknown) {
  const span = createSpan()
  definition.end({ span, record, duration, error })
  return span
}

function assertMetric (
  metric: sinon.SinonStub,
  value: number,
  attributes: Record<string, unknown>
) {
  sinon.assert.calledOnceWithExactly(metric, value, attributes)
}

describe('trace definitions', () => {
  afterEach(() => {
    sinon.restore()
  })

  describe('AgentApplicationTraceDefinitions', () => {
    it('should set route attributes and turn metrics when a turn ends', () => {
      const turnsTotal = { add: sinon.stub() }
      const turnDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'turnsTotalCounter').value(turnsTotal as any)
      sinon.stub(HostingMetrics, 'turnDuration').value(turnDuration as any)
      const activity = Activity.fromObject({ type: 'message', channelId: 'msteams', name: 'test-activity' })

      const span = endTrace(AgentApplicationTraceDefinitions.run, {
        authorized: true,
        activity,
        routeMatched: true,
      })
      const metricAttributes = {
        'activity.type': 'message',
        'activity.channel_id': 'msteams',
      }

      assert.deepEqual(span.attributes, {
        'route.authorized': true,
        'route.matched': true,
        ...metricAttributes,
        'activity.name': 'test-activity',
      })
      assertMetric(turnsTotal.add, 1, metricAttributes)
      assertMetric(turnDuration.record, duration, metricAttributes)
    })

    it('should set the error metric when a turn ends with an error', () => {
      const turnsTotal = { add: sinon.stub() }
      const turnsErrors = { add: sinon.stub() }
      const turnDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'turnsTotalCounter').value(turnsTotal as any)
      sinon.stub(HostingMetrics, 'turnsErrorsCounter').value(turnsErrors as any)
      sinon.stub(HostingMetrics, 'turnDuration').value(turnDuration as any)

      endTrace(AgentApplicationTraceDefinitions.run, {
        authorized: false,
        activity: Activity.fromObject({ type: 'message' }),
        routeMatched: false,
      }, new TypeError('invalid turn'))

      assertMetric(turnsTotal.add, 1, {
        'activity.type': 'message',
        'activity.channel_id': 'unknown',
      })
      assertMetric(turnsErrors.add, 1, { 'error.type': 'TypeError' })
    })

    it('should set the primitive error type metric when a turn ends with a primitive error', () => {
      const turnsErrors = { add: sinon.stub() }
      sinon.stub(HostingMetrics, 'turnsErrorsCounter').value(turnsErrors as any)

      endTrace(AgentApplicationTraceDefinitions.run, {
        authorized: false,
        activity: Activity.fromObject({ type: 'message' }),
        routeMatched: false,
      }, 'invalid turn')

      assertMetric(turnsErrors.add, 1, { 'error.type': 'string' })
    })

    it('should set default route attributes and metric attributes when a run ends', () => {
      const turnsTotal = { add: sinon.stub() }
      const turnDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'turnsTotalCounter').value(turnsTotal as any)
      sinon.stub(HostingMetrics, 'turnDuration').value(turnDuration as any)

      const span = endTrace(AgentApplicationTraceDefinitions.run, AgentApplicationTraceDefinitions.run.record)
      const metricAttributes = {
        'activity.type': 'unknown',
        'activity.channel_id': 'unknown',
      }

      assert.deepEqual(span.attributes, {
        'route.authorized': false,
        'route.matched': false,
        ...metricAttributes,
        'activity.name': 'unknown',
      })
      assertMetric(turnsTotal.add, 1, metricAttributes)
      assertMetric(turnDuration.record, duration, metricAttributes)
    })

    it('should use unknown activity attributes when a run receives nullish activity values', () => {
      const turnsTotal = { add: sinon.stub() }
      const turnDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'turnsTotalCounter').value(turnsTotal as any)
      sinon.stub(HostingMetrics, 'turnDuration').value(turnDuration as any)

      const span = endTrace(AgentApplicationTraceDefinitions.run, {
        authorized: false,
        activity: { type: undefined, channelId: null },
        routeMatched: false,
      })
      const metricAttributes = {
        'activity.type': 'unknown',
        'activity.channel_id': 'unknown',
      }

      assert.deepEqual(span.attributes, {
        'route.authorized': false,
        'route.matched': false,
        ...metricAttributes,
        'activity.name': 'unknown',
      })
      assertMetric(turnsTotal.add, 1, metricAttributes)
      assertMetric(turnDuration.record, duration, metricAttributes)
    })

    it('should set the attachment count when file downloads end', () => {
      const span = endTrace(AgentApplicationTraceDefinitions.downloadFiles, { attachmentsCount: 3 })

      assert.deepEqual(span.attributes, { 'agents.attachments.count': 3 })
    })

    it('should set route type attributes when a route handler ends', () => {
      const span = endTrace(AgentApplicationTraceDefinitions.routeHandler, {
        isInvoke: true,
        isAgentic: true,
      })

      assert.deepEqual(span.attributes, {
        'route.is_invoke': true,
        'route.is_agentic': true,
      })
    })

    it('should set default attachment and route handler attributes when their traces end', () => {
      const downloadSpan = endTrace(
        AgentApplicationTraceDefinitions.downloadFiles,
        AgentApplicationTraceDefinitions.downloadFiles.record
      )
      const routeSpan = endTrace(
        AgentApplicationTraceDefinitions.routeHandler,
        AgentApplicationTraceDefinitions.routeHandler.record
      )

      assert.deepEqual(downloadSpan.attributes, { 'agents.attachments.count': 0 })
      assert.deepEqual(routeSpan.attributes, {
        'route.is_invoke': false,
        'route.is_agentic': false,
      })
    })
  })

  describe('TurnContextTraceDefinitions', () => {
    it('should add activity event attributes when an activity is recorded', () => {
      const span = createSpan()
      const actions = TurnContextTraceDefinitions.sendActivities.actions!({ span } as any)

      actions.recordActivity(Activity.fromObject({
        id: 'activity-id',
        type: 'message',
        deliveryMode: 'expectReplies',
      }))

      assert.deepEqual(span.events, [{
        name: 'activity.sent',
        attributes: {
          'activity.id': 'activity-id',
          'activity.type': 'message',
          'activity.delivery_mode': 'expectReplies',
        },
      }])
    })

    it('should set the activity count when sending activities ends', () => {
      const span = endTrace(TurnContextTraceDefinitions.sendActivities, { activityCount: 2 })

      assert.deepEqual(span.attributes, { 'activity.count': 2 })
    })

    it('should set default activity event and count attributes when sending activities', () => {
      const eventSpan = createSpan()
      const actions = TurnContextTraceDefinitions.sendActivities.actions!({ span: eventSpan } as any)
      actions.recordActivity(Activity.fromObject({ type: 'unknown' }))
      const endSpan = endTrace(
        TurnContextTraceDefinitions.sendActivities,
        TurnContextTraceDefinitions.sendActivities.record
      )

      assert.deepEqual(eventSpan.events, [{
        name: 'activity.sent',
        attributes: {
          'activity.id': 'unknown',
          'activity.type': 'unknown',
          'activity.delivery_mode': 'unknown',
        },
      }])
      assert.deepEqual(endSpan.attributes, { 'activity.count': 0 })
    })
  })

  describe('AgentClientTraceDefinitions', () => {
    it('should set request attributes and metrics when posting an activity ends', () => {
      const requests = sinon.stub(HostingMetrics.agentClientRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.agentClientRequestDuration, 'record')
      const attributes = {
        'target.endpoint': 'https://agent.example.com',
        'target.client_id': 'client-id',
        'http.status_code': 202,
      }

      const span = endTrace(AgentClientTraceDefinitions.postActivity, {
        endpoint: attributes['target.endpoint'],
        clientId: attributes['target.client_id'],
        httpStatusCode: attributes['http.status_code'],
      })

      assert.deepEqual(span.attributes, attributes)
      assertMetric(requests, 1, attributes)
      assertMetric(requestDuration, duration, attributes)
    })

    it('should set default request attributes and metrics when posting an activity ends', () => {
      const requests = sinon.stub(HostingMetrics.agentClientRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.agentClientRequestDuration, 'record')
      const attributes = {
        'target.endpoint': '',
        'target.client_id': '',
        'http.status_code': 'unknown',
      }

      const span = endTrace(AgentClientTraceDefinitions.postActivity, AgentClientTraceDefinitions.postActivity.record)

      assert.deepEqual(span.attributes, attributes)
      assertMetric(requests, 1, attributes)
      assertMetric(requestDuration, duration, attributes)
    })

    it('should use unknown request attributes when posting an activity has nullish values', () => {
      const requests = sinon.stub(HostingMetrics.agentClientRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.agentClientRequestDuration, 'record')
      const attributes = {
        'target.endpoint': 'unknown',
        'target.client_id': 'unknown',
        'http.status_code': 'unknown',
      }

      const span = endTrace(AgentClientTraceDefinitions.postActivity, {
        endpoint: undefined,
        clientId: null,
        httpStatusCode: null,
      })

      assert.deepEqual(span.attributes, attributes)
      assertMetric(requests, 1, attributes)
      assertMetric(requestDuration, duration, attributes)
    })
  })

  describe('AdapterTraceDefinitions', () => {
    it('should set connector attributes when creating a connector client ends', () => {
      const span = endTrace(AdapterTraceDefinitions.createConnectorClient, {
        serviceUrl: 'https://service.example.com',
        scopes: ['scope-a'],
        activityIsAgentic: true,
      })

      assert.deepEqual(span.attributes, {
        service_url: 'https://service.example.com',
        'auth.scopes': ['scope-a'],
        'activity.is_agentic': true,
      })
    })

    it('should set token service attributes when creating a user token client ends', () => {
      const span = endTrace(AdapterTraceDefinitions.createUserTokenClient, {
        tokenServiceEndpoint: 'https://token.example.com',
        authScope: 'token-scope',
      })

      assert.deepEqual(span.attributes, {
        'token.service.endpoint': 'https://token.example.com',
        'auth.scope': 'token-scope',
      })
    })

    it('should add event attributes and sent metric when an outbound activity is recorded', () => {
      const activitiesSent = sinon.stub(HostingMetrics.activitiesSentCounter, 'add')
      const span = createSpan()
      const actions = AdapterTraceDefinitions.sendActivities.actions!({ span } as any)
      const activityAttributes = {
        'activity.type': 'message',
        'activity.channel_id': 'webchat',
        'activity.conversation_id': 'conversation-id',
      }

      actions.recordActivity(Activity.fromObject({
        id: 'activity-id',
        type: activityAttributes['activity.type'],
        channelId: activityAttributes['activity.channel_id'],
        conversation: { id: activityAttributes['activity.conversation_id'] },
      }))

      assert.deepEqual(span.events, [{
        name: 'activity.sent',
        attributes: {
          'activity.id': 'activity-id',
          ...activityAttributes,
        },
      }])
      assertMetric(activitiesSent, 1, activityAttributes)
    })

    it('should use unknown attributes when recording an outbound activity with nullish values', () => {
      const activitiesSent = { add: sinon.stub() }
      sinon.stub(HostingMetrics, 'activitiesSentCounter').value(activitiesSent as any)
      const span = createSpan()
      const actions = AdapterTraceDefinitions.sendActivities.actions!({ span } as any)
      const attributes = {
        'activity.type': 'unknown',
        'activity.channel_id': 'unknown',
        'activity.conversation_id': 'unknown',
      }

      actions.recordActivity({
        id: undefined,
        type: undefined,
        channelId: null,
        conversation: undefined,
      } as any)

      assert.deepEqual(span.events, [{
        name: 'activity.sent',
        attributes: {
          'activity.id': 'unknown',
          ...attributes,
        },
      }])
      assertMetric(activitiesSent.add, 1, attributes)
    })

    it('should set the activity count when adapter sending ends', () => {
      const span = endTrace(AdapterTraceDefinitions.sendActivities, { activityCount: 4 })

      assert.deepEqual(span.attributes, { 'activity.count': 4 })
    })

    it('should set activity attributes and received metrics when adapter processing ends', () => {
      const processDuration = sinon.stub(HostingMetrics.adapterProcessDuration, 'record')
      const activitiesReceived = sinon.stub(HostingMetrics.activitiesReceivedCounter, 'add')
      const activity = Activity.fromObject({
        type: 'message',
        channelId: 'msteams',
        deliveryMode: 'normal',
        conversation: { id: 'conversation-id' },
      })

      const span = endTrace(AdapterTraceDefinitions.process, { activity })

      assert.deepEqual(span.attributes, {
        'activity.type': 'message',
        'activity.channel_id': 'msteams',
        'activity.delivery_mode': 'normal',
        'activity.conversation_id': 'conversation-id',
        'activity.is_agentic': false,
      })
      assertMetric(processDuration, duration, { 'activity.type': 'message' })
      assertMetric(activitiesReceived, 1, {
        'activity.type': 'message',
        'activity.channel_id': 'msteams',
      })
    })

    it('should set activity attributes and updated metric when updating an activity ends', () => {
      const activitiesUpdated = sinon.stub(HostingMetrics.activitiesUpdatedCounter, 'add')
      const activity = Activity.fromObject({
        id: 'activity-id',
        type: 'message',
        channelId: 'webchat',
        conversation: { id: 'conversation-id' },
      })

      const span = endTrace(AdapterTraceDefinitions.updateActivity, { activity })

      assert.deepEqual(span.attributes, {
        'activity.id': 'activity-id',
        'activity.conversation_id': 'conversation-id',
      })
      assertMetric(activitiesUpdated, 1, { 'activity.channel_id': 'webchat' })
    })

    it('should set activity attributes and deleted metric when deleting an activity ends', () => {
      const activitiesDeleted = sinon.stub(HostingMetrics.activitiesDeletedCounter, 'add')

      const span = endTrace(AdapterTraceDefinitions.deleteActivity, {
        reference: {
          activityId: 'activity-id',
          channelId: 'webchat',
          conversation: { id: 'conversation-id' },
        },
      })

      assert.deepEqual(span.attributes, {
        'activity.id': 'activity-id',
        'activity.conversation_id': 'conversation-id',
      })
      assertMetric(activitiesDeleted, 1, { 'activity.channel_id': 'webchat' })
    })

    it('should set conversation attributes when continuing a conversation ends', () => {
      const span = endTrace(AdapterTraceDefinitions.continueConversation, {
        botAppId: 'bot-app-id',
        conversationId: 'conversation-id',
        isAgentic: true,
      })

      assert.deepEqual(span.attributes, {
        'bot.app_id': 'bot-app-id',
        'activity.conversation_id': 'conversation-id',
        'activity.is_agentic': true,
      })
    })

    it('should omit agentic activity attribute when connector client activity state is undefined', () => {
      const span = endTrace(AdapterTraceDefinitions.createConnectorClient, {
        serviceUrl: undefined,
        scopes: undefined,
        activityIsAgentic: undefined,
      })

      assert.deepEqual(span.attributes, {
        service_url: 'unknown',
        'auth.scopes': 'unknown',
      })
    })

    it('should set default attributes when adapter traces end', () => {
      const processDuration = { record: sinon.stub() }
      const activitiesReceived = { add: sinon.stub() }
      const activitiesUpdated = { add: sinon.stub() }
      const activitiesDeleted = { add: sinon.stub() }
      sinon.stub(HostingMetrics, 'adapterProcessDuration').value(processDuration as any)
      sinon.stub(HostingMetrics, 'activitiesReceivedCounter').value(activitiesReceived as any)
      sinon.stub(HostingMetrics, 'activitiesUpdatedCounter').value(activitiesUpdated as any)
      sinon.stub(HostingMetrics, 'activitiesDeletedCounter').value(activitiesDeleted as any)
      const connectorSpan = endTrace(
        AdapterTraceDefinitions.createConnectorClient,
        AdapterTraceDefinitions.createConnectorClient.record
      )
      const userTokenSpan = endTrace(
        AdapterTraceDefinitions.createUserTokenClient,
        AdapterTraceDefinitions.createUserTokenClient.record
      )
      const sendSpan = endTrace(AdapterTraceDefinitions.sendActivities, AdapterTraceDefinitions.sendActivities.record)
      const processSpan = endTrace(AdapterTraceDefinitions.process, AdapterTraceDefinitions.process.record)
      const updateSpan = endTrace(AdapterTraceDefinitions.updateActivity, AdapterTraceDefinitions.updateActivity.record)
      const deleteSpan = endTrace(AdapterTraceDefinitions.deleteActivity, AdapterTraceDefinitions.deleteActivity.record)
      const continueSpan = endTrace(
        AdapterTraceDefinitions.continueConversation,
        AdapterTraceDefinitions.continueConversation.record
      )

      assert.deepEqual(connectorSpan.attributes, {
        service_url: '',
        'auth.scopes': [],
        'activity.is_agentic': false,
      })
      assert.deepEqual(userTokenSpan.attributes, {
        'token.service.endpoint': '',
        'auth.scope': '',
      })
      assert.deepEqual(sendSpan.attributes, { 'activity.count': 0 })
      assert.deepEqual(processSpan.attributes, {
        'activity.type': 'unknown',
        'activity.channel_id': 'unknown',
        'activity.delivery_mode': 'unknown',
        'activity.conversation_id': 'unknown',
        'activity.is_agentic': false,
      })
      assert.deepEqual(updateSpan.attributes, {
        'activity.id': 'unknown',
        'activity.conversation_id': 'unknown',
      })
      assert.deepEqual(deleteSpan.attributes, {
        'activity.id': 'unknown',
        'activity.conversation_id': 'unknown',
      })
      assert.deepEqual(continueSpan.attributes, {
        'bot.app_id': '',
        'activity.conversation_id': '',
        'activity.is_agentic': false,
      })
      assertMetric(processDuration.record, duration, { 'activity.type': 'unknown' })
      assertMetric(activitiesReceived.add, 1, {
        'activity.type': 'unknown',
        'activity.channel_id': 'unknown',
      })
      assertMetric(activitiesUpdated.add, 1, { 'activity.channel_id': 'unknown' })
      assertMetric(activitiesDeleted.add, 1, { 'activity.channel_id': 'unknown' })
    })
  })

  describe('ProactiveTraceDefinitions', () => {
    function assertConversationAttribute (definition: any) {
      const span = endTrace(definition, { conversationId: 'conversation-id' })

      assert.deepEqual(span.attributes, { 'activity.conversation_id': 'conversation-id' })
    }

    it('should set the conversation attribute when storing a conversation ends', () => {
      assertConversationAttribute(ProactiveTraceDefinitions.storeConversation)
    })

    it('should set the conversation attribute when getting or throwing for a conversation ends', () => {
      assertConversationAttribute(ProactiveTraceDefinitions.getConversationOrThrow)
    })

    it('should set the conversation attribute when deleting a conversation ends', () => {
      assertConversationAttribute(ProactiveTraceDefinitions.deleteConversation)
    })

    it('should set conversation lookup attributes when getting a conversation ends', () => {
      const span = endTrace(ProactiveTraceDefinitions.getConversation, {
        conversationId: 'conversation-id',
        found: true,
      })

      assert.deepEqual(span.attributes, {
        'activity.conversation_id': 'conversation-id',
        'proactive.conversation_found': true,
      })
    })

    it('should link a stored conversation to the active span when storing a conversation', async () => {
      const span = createSpan()
      const parentContext = { traceId: 'parent-trace-id', spanId: 'parent-span-id' }
      const storage = {
        read: sinon.stub().resolves({ key: { value: 'stored', __link: parentContext } }),
      }
      const actions = ProactiveTraceDefinitions.storeConversation.actions!({ span } as any)

      const item = await actions.link(storage as any, 'key')

      assert.deepEqual(storage.read.firstCall.args, [['key']])
      assert.deepEqual(span.links, [{ context: parentContext }])
      assert.deepEqual(item, {
        value: 'stored',
        __link: span.spanContext(),
      })
    })

    it('should link an existing conversation when proactively sending an activity', async () => {
      const span = createSpan()
      const parentContext = { traceId: 'parent-trace-id', spanId: 'parent-span-id' }
      const storage = { read: sinon.stub().resolves({ key: { __link: parentContext } }) }
      const actions = ProactiveTraceDefinitions.sendActivity.actions!({ span } as any)

      await actions.link(storage as any, 'key')

      assert.deepEqual(storage.read.firstCall.args, [['key']])
      assert.deepEqual(span.links, [{ context: parentContext }])
    })

    it('should not add a link when continuing a conversation has no stored link context', async () => {
      const span = createSpan()
      const storage = { read: sinon.stub().resolves({}) }
      const actions = ProactiveTraceDefinitions.continueConversation.actions!({ span } as any)

      await actions.link(storage as any, 'key')

      assert.deepEqual(storage.read.firstCall.args, [['key']])
      assert.deepEqual(span.links, [])
    })

    function assertOperation (
      definition: any,
      record: Record<string, unknown>,
      spanAttributes: Record<string, unknown>,
      metricAttributes: Record<string, unknown>,
      error?: unknown
    ) {
      const operations = sinon.stub(HostingMetrics.proactiveOperationCounter, 'add')
      const operationDuration = sinon.stub(HostingMetrics.proactiveOperationDuration, 'record')

      const span = endTrace(definition, record, error)

      assert.deepEqual(span.attributes, spanAttributes)
      assertMetric(operations, 1, metricAttributes)
      assertMetric(operationDuration, duration, metricAttributes)
    }

    it('should set attributes and operation metrics when sending an activity ends', () => {
      assertOperation(
        ProactiveTraceDefinitions.sendActivity,
        { conversationId: 'conversation-id', channelId: 'webchat', activityType: 'message' },
        {
          'activity.channel_id': 'webchat',
          'activity.type': 'message',
          'activity.conversation_id': 'conversation-id',
        },
        {
          'activity.channel_id': 'webchat',
          'activity.type': 'message',
          operation: 'send.activity',
          'operation.success': true,
        }
      )
    })

    it('should set attributes and operation metrics when continuing a conversation ends', () => {
      assertOperation(
        ProactiveTraceDefinitions.continueConversation,
        { conversationId: 'conversation-id', channelId: 'msteams', hasAutoSignIn: true },
        {
          'activity.channel_id': 'msteams',
          'proactive.has_auto_sign_in': true,
          'activity.conversation_id': 'conversation-id',
        },
        {
          'activity.channel_id': 'msteams',
          'proactive.has_auto_sign_in': true,
          operation: 'continue.conversation',
          'operation.success': true,
        }
      )
    })

    it('should set attributes and operation metrics when creating a conversation ends', () => {
      assertOperation(
        ProactiveTraceDefinitions.createConversation,
        { channelId: 'msteams', membersCount: 2, storeConversation: true, hasHandler: true },
        {
          'activity.channel_id': 'msteams',
          'proactive.store_conversation': true,
          'proactive.has_handler': true,
          'proactive.members_count': 2,
        },
        {
          'activity.channel_id': 'msteams',
          'proactive.store_conversation': true,
          'proactive.has_handler': true,
          operation: 'create.conversation',
          'operation.success': true,
        }
      )
    })

    it('should set a failed operation metric when sending an activity fails', () => {
      assertOperation(
        ProactiveTraceDefinitions.sendActivity,
        { conversationId: 'conversation-id', channelId: 'webchat', activityType: 'message' },
        {
          'activity.channel_id': 'webchat',
          'activity.type': 'message',
          'activity.conversation_id': 'conversation-id',
        },
        {
          'activity.channel_id': 'webchat',
          'activity.type': 'message',
          operation: 'send.activity',
          'operation.success': false,
        },
        new Error('send failed')
      )
    })

    it('should set a failed operation metric when continuing a conversation fails', () => {
      assertOperation(
        ProactiveTraceDefinitions.continueConversation,
        { conversationId: 'conversation-id', channelId: 'msteams', hasAutoSignIn: true },
        {
          'activity.channel_id': 'msteams',
          'proactive.has_auto_sign_in': true,
          'activity.conversation_id': 'conversation-id',
        },
        {
          'activity.channel_id': 'msteams',
          'proactive.has_auto_sign_in': true,
          operation: 'continue.conversation',
          'operation.success': false,
        },
        new Error('continue failed')
      )
    })

    it('should set a failed operation metric when creating a conversation fails', () => {
      assertOperation(
        ProactiveTraceDefinitions.createConversation,
        { channelId: 'msteams', membersCount: 2, storeConversation: true, hasHandler: true },
        {
          'activity.channel_id': 'msteams',
          'proactive.store_conversation': true,
          'proactive.has_handler': true,
          'proactive.members_count': 2,
        },
        {
          'activity.channel_id': 'msteams',
          'proactive.store_conversation': true,
          'proactive.has_handler': true,
          operation: 'create.conversation',
          'operation.success': false,
        },
        new Error('create failed')
      )
    })

    it('should set default attributes when proactive traces end', () => {
      const operations = { add: sinon.stub() }
      const operationDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'proactiveOperationCounter').value(operations as any)
      sinon.stub(HostingMetrics, 'proactiveOperationDuration').value(operationDuration as any)
      const storeSpan = endTrace(ProactiveTraceDefinitions.storeConversation, ProactiveTraceDefinitions.storeConversation.record)
      const getSpan = endTrace(ProactiveTraceDefinitions.getConversation, ProactiveTraceDefinitions.getConversation.record)
      const getOrThrowSpan = endTrace(
        ProactiveTraceDefinitions.getConversationOrThrow,
        ProactiveTraceDefinitions.getConversationOrThrow.record
      )
      const deleteSpan = endTrace(ProactiveTraceDefinitions.deleteConversation, ProactiveTraceDefinitions.deleteConversation.record)
      const sendSpan = endTrace(ProactiveTraceDefinitions.sendActivity, ProactiveTraceDefinitions.sendActivity.record)
      const continueSpan = endTrace(
        ProactiveTraceDefinitions.continueConversation,
        ProactiveTraceDefinitions.continueConversation.record
      )
      const createConversationSpan = endTrace(
        ProactiveTraceDefinitions.createConversation,
        ProactiveTraceDefinitions.createConversation.record
      )

      assert.deepEqual(storeSpan.attributes, { 'activity.conversation_id': '' })
      assert.deepEqual(getSpan.attributes, {
        'activity.conversation_id': '',
        'proactive.conversation_found': false,
      })
      assert.deepEqual(getOrThrowSpan.attributes, { 'activity.conversation_id': '' })
      assert.deepEqual(deleteSpan.attributes, { 'activity.conversation_id': '' })
      assert.deepEqual(sendSpan.attributes, {
        'activity.channel_id': '',
        'activity.type': '',
        'activity.conversation_id': '',
      })
      assert.deepEqual(continueSpan.attributes, {
        'activity.channel_id': '',
        'proactive.has_auto_sign_in': false,
        'activity.conversation_id': '',
      })
      assert.deepEqual(createConversationSpan.attributes, {
        'activity.channel_id': '',
        'proactive.store_conversation': false,
        'proactive.has_handler': false,
        'proactive.members_count': 0,
      })
      assert.deepEqual(operations.add.getCalls().map(call => call.args), [
        [1, {
          'activity.channel_id': '',
          'activity.type': '',
          operation: 'send.activity',
          'operation.success': true,
        }],
        [1, {
          'activity.channel_id': '',
          'proactive.has_auto_sign_in': false,
          operation: 'continue.conversation',
          'operation.success': true,
        }],
        [1, {
          'activity.channel_id': '',
          'proactive.store_conversation': false,
          'proactive.has_handler': false,
          operation: 'create.conversation',
          'operation.success': true,
        }],
      ])
      assert.deepEqual(operationDuration.record.getCalls().map(call => call.args), [
        [duration, {
          'activity.channel_id': '',
          'activity.type': '',
          operation: 'send.activity',
          'operation.success': true,
        }],
        [duration, {
          'activity.channel_id': '',
          'proactive.has_auto_sign_in': false,
          operation: 'continue.conversation',
          'operation.success': true,
        }],
        [duration, {
          'activity.channel_id': '',
          'proactive.store_conversation': false,
          'proactive.has_handler': false,
          operation: 'create.conversation',
          'operation.success': true,
        }],
      ])
    })

    it('should use unknown attributes when proactive activity values are nullish', () => {
      assertOperation(
        ProactiveTraceDefinitions.sendActivity,
        {
          conversationId: undefined,
          channelId: null,
          activityType: undefined,
        },
        {
          'activity.channel_id': 'unknown',
          'activity.type': 'unknown',
          'activity.conversation_id': 'unknown',
        },
        {
          'activity.channel_id': 'unknown',
          'activity.type': 'unknown',
          operation: 'send.activity',
          'operation.success': true,
        }
      )
    })
  })

  describe('ConnectorClientTraceDefinitions', () => {
    function assertRequest (
      definition: any,
      operation: string,
      method: string,
      record: Record<string, unknown> = {},
      spanAttributes: Record<string, unknown> = {}
    ) {
      const requests = sinon.stub(HostingMetrics.connectorRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.connectorRequestDuration, 'record')
      const metricAttributes = {
        operation,
        'http.method': method,
        'http.status_code': 200,
      }

      const span = endTrace(definition, { ...record, httpStatusCode: 200 })

      assert.deepEqual(span.attributes, spanAttributes)
      assertMetric(requests, 1, metricAttributes)
      assertMetric(requestDuration, duration, metricAttributes)
    }

    it('should set attributes and request metrics when getting conversations ends', () => {
      assertRequest(ConnectorClientTraceDefinitions.getConversations, 'get.conversations', 'GET')
    })

    it('should set attributes and request metrics when getting a conversation member ends', () => {
      assertRequest(ConnectorClientTraceDefinitions.getConversationMember, 'get.conversation.member', 'GET')
    })

    it('should set attributes and request metrics when creating a conversation ends', () => {
      assertRequest(ConnectorClientTraceDefinitions.createConversation, 'create.conversation', 'POST')
    })

    it('should set attributes and request metrics when replying to an activity ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.replyToActivity,
        'reply.to.activity',
        'POST',
        { conversationId: 'conversation-id', activityId: 'activity-id' },
        { 'activity.conversation_id': 'conversation-id', 'activity.id': 'activity-id' }
      )
    })

    it('should set attributes and request metrics when sending to a conversation ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.sendToConversation,
        'send.to.conversation',
        'POST',
        { conversationId: 'conversation-id' },
        { 'activity.conversation_id': 'conversation-id' }
      )
    })

    it('should set attributes and request metrics when updating an activity ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.updateActivity,
        'update.activity',
        'PUT',
        { conversationId: 'conversation-id', activityId: 'activity-id' },
        { 'activity.conversation_id': 'conversation-id', 'activity.id': 'activity-id' }
      )
    })

    it('should set attributes and request metrics when deleting an activity ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.deleteActivity,
        'delete.activity',
        'DELETE',
        { conversationId: 'conversation-id', activityId: 'activity-id' },
        { 'activity.conversation_id': 'conversation-id', 'activity.id': 'activity-id' }
      )
    })

    it('should set attributes and request metrics when uploading an attachment ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.uploadAttachment,
        'upload.attachment',
        'POST',
        { conversationId: 'conversation-id' },
        { 'activity.conversation_id': 'conversation-id' }
      )
    })

    it('should set attributes and request metrics when getting attachment info ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.getAttachmentInfo,
        'get.attachment.info',
        'GET',
        { attachmentId: 'attachment-id' },
        { 'attachment.id': 'attachment-id' }
      )
    })

    it('should set attributes and request metrics when getting an attachment ends', () => {
      assertRequest(
        ConnectorClientTraceDefinitions.getAttachment,
        'get.attachment',
        'GET',
        { attachmentId: 'attachment-id', viewId: 'view-id' },
        { 'attachment.id': 'attachment-id', 'view.id': 'view-id' }
      )
    })

    it('should set default attributes when connector client traces end', () => {
      const replySpan = endTrace(
        ConnectorClientTraceDefinitions.replyToActivity,
        ConnectorClientTraceDefinitions.replyToActivity.record
      )
      const sendSpan = endTrace(
        ConnectorClientTraceDefinitions.sendToConversation,
        ConnectorClientTraceDefinitions.sendToConversation.record
      )
      const updateSpan = endTrace(
        ConnectorClientTraceDefinitions.updateActivity,
        ConnectorClientTraceDefinitions.updateActivity.record
      )
      const deleteSpan = endTrace(
        ConnectorClientTraceDefinitions.deleteActivity,
        ConnectorClientTraceDefinitions.deleteActivity.record
      )
      const uploadSpan = endTrace(
        ConnectorClientTraceDefinitions.uploadAttachment,
        ConnectorClientTraceDefinitions.uploadAttachment.record
      )
      const attachmentInfoSpan = endTrace(
        ConnectorClientTraceDefinitions.getAttachmentInfo,
        ConnectorClientTraceDefinitions.getAttachmentInfo.record
      )
      const attachmentSpan = endTrace(
        ConnectorClientTraceDefinitions.getAttachment,
        ConnectorClientTraceDefinitions.getAttachment.record
      )

      assert.deepEqual(replySpan.attributes, {
        'activity.conversation_id': '',
        'activity.id': '',
      })
      assert.deepEqual(sendSpan.attributes, { 'activity.conversation_id': '' })
      assert.deepEqual(updateSpan.attributes, {
        'activity.conversation_id': '',
        'activity.id': '',
      })
      assert.deepEqual(deleteSpan.attributes, {
        'activity.conversation_id': '',
        'activity.id': '',
      })
      assert.deepEqual(uploadSpan.attributes, { 'activity.conversation_id': '' })
      assert.deepEqual(attachmentInfoSpan.attributes, { 'attachment.id': '' })
      assert.deepEqual(attachmentSpan.attributes, {
        'attachment.id': '',
        'view.id': '',
      })
    })

    it('should set unknown HTTP status metric attributes when connector client records use defaults', () => {
      const requests = { add: sinon.stub() }
      const requestDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'connectorRequestsCounter').value(requests as any)
      sinon.stub(HostingMetrics, 'connectorRequestDuration').value(requestDuration as any)

      endTrace(ConnectorClientTraceDefinitions.getConversations, ConnectorClientTraceDefinitions.getConversations.record)
      endTrace(ConnectorClientTraceDefinitions.getConversationMember, ConnectorClientTraceDefinitions.getConversationMember.record)
      endTrace(ConnectorClientTraceDefinitions.createConversation, ConnectorClientTraceDefinitions.createConversation.record)
      endTrace(ConnectorClientTraceDefinitions.replyToActivity, ConnectorClientTraceDefinitions.replyToActivity.record)
      endTrace(ConnectorClientTraceDefinitions.sendToConversation, ConnectorClientTraceDefinitions.sendToConversation.record)
      endTrace(ConnectorClientTraceDefinitions.updateActivity, ConnectorClientTraceDefinitions.updateActivity.record)
      endTrace(ConnectorClientTraceDefinitions.deleteActivity, ConnectorClientTraceDefinitions.deleteActivity.record)
      endTrace(ConnectorClientTraceDefinitions.uploadAttachment, ConnectorClientTraceDefinitions.uploadAttachment.record)
      endTrace(ConnectorClientTraceDefinitions.getAttachmentInfo, ConnectorClientTraceDefinitions.getAttachmentInfo.record)
      endTrace(ConnectorClientTraceDefinitions.getAttachment, ConnectorClientTraceDefinitions.getAttachment.record)

      assert.deepEqual(requests.add.getCalls().map(call => call.args), [
        [1, { operation: 'get.conversations', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [1, { operation: 'get.conversation.member', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [1, { operation: 'create.conversation', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [1, { operation: 'reply.to.activity', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [1, { operation: 'send.to.conversation', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [1, { operation: 'update.activity', 'http.method': 'PUT', 'http.status_code': 'unknown' }],
        [1, { operation: 'delete.activity', 'http.method': 'DELETE', 'http.status_code': 'unknown' }],
        [1, { operation: 'upload.attachment', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [1, { operation: 'get.attachment.info', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [1, { operation: 'get.attachment', 'http.method': 'GET', 'http.status_code': 'unknown' }],
      ])
      assert.deepEqual(requestDuration.record.getCalls().map(call => call.args), [
        [duration, { operation: 'get.conversations', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [duration, { operation: 'get.conversation.member', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [duration, { operation: 'create.conversation', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [duration, { operation: 'reply.to.activity', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [duration, { operation: 'send.to.conversation', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [duration, { operation: 'update.activity', 'http.method': 'PUT', 'http.status_code': 'unknown' }],
        [duration, { operation: 'delete.activity', 'http.method': 'DELETE', 'http.status_code': 'unknown' }],
        [duration, { operation: 'upload.attachment', 'http.method': 'POST', 'http.status_code': 'unknown' }],
        [duration, { operation: 'get.attachment.info', 'http.method': 'GET', 'http.status_code': 'unknown' }],
        [duration, { operation: 'get.attachment', 'http.method': 'GET', 'http.status_code': 'unknown' }],
      ])
    })

    it('should use unknown attributes when connector client records have nullish values', () => {
      const requests = { add: sinon.stub() }
      const requestDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'connectorRequestsCounter').value(requests as any)
      sinon.stub(HostingMetrics, 'connectorRequestDuration').value(requestDuration as any)
      const span = endTrace(ConnectorClientTraceDefinitions.replyToActivity, {
        conversationId: undefined,
        activityId: null,
        httpStatusCode: null,
      })
      const metricAttributes = {
        operation: 'reply.to.activity',
        'http.method': 'POST',
        'http.status_code': 'unknown',
      }

      assert.deepEqual(span.attributes, {
        'activity.conversation_id': 'unknown',
        'activity.id': 'unknown',
      })
      assertMetric(requests.add, 1, metricAttributes)
      assertMetric(requestDuration.record, duration, metricAttributes)
    })
  })

  describe('StorageTraceDefinitions', () => {
    function assertStorageOperation (operation: keyof typeof StorageTraceDefinitions) {
      const operationDuration = sinon.stub(HostingMetrics.storageOperationDuration, 'record')
      const attributes = {
        'storage.operation': operation,
        'storage.key.count': 3,
      }

      const span = endTrace(StorageTraceDefinitions[operation], { keyCount: 3 })

      assert.deepEqual(span.attributes, attributes)
      assertMetric(operationDuration, duration, attributes)
    }

    it('should set attributes and duration metric when storage read ends', () => {
      assertStorageOperation('read')
    })

    it('should set attributes and duration metric when storage write ends', () => {
      assertStorageOperation('write')
    })

    it('should set attributes and duration metric when storage delete ends', () => {
      assertStorageOperation('delete')
    })

    it('should set zero key count attributes when storage operations use defaults', () => {
      const operationDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'storageOperationDuration').value(operationDuration as any)
      const readSpan = endTrace(StorageTraceDefinitions.read, StorageTraceDefinitions.read.record)
      const writeSpan = endTrace(StorageTraceDefinitions.write, StorageTraceDefinitions.write.record)
      const deleteSpan = endTrace(StorageTraceDefinitions.delete, StorageTraceDefinitions.delete.record)

      assert.deepEqual(readSpan.attributes, { 'storage.operation': 'read', 'storage.key.count': 0 })
      assert.deepEqual(writeSpan.attributes, { 'storage.operation': 'write', 'storage.key.count': 0 })
      assert.deepEqual(deleteSpan.attributes, { 'storage.operation': 'delete', 'storage.key.count': 0 })
      assert.deepEqual(operationDuration.record.getCalls().map(call => call.args), [
        [duration, { 'storage.operation': 'read', 'storage.key.count': 0 }],
        [duration, { 'storage.operation': 'write', 'storage.key.count': 0 }],
        [duration, { 'storage.operation': 'delete', 'storage.key.count': 0 }],
      ])
    })
  })

  describe('AuthenticationTraceDefinitions', () => {
    function assertTokenRequest (
      definition: any,
      record: Record<string, unknown>,
      spanAttributes: Record<string, unknown>,
      method: string,
      error?: unknown
    ) {
      const requests = sinon.stub(HostingMetrics.authTokenRequestsCounter, 'add')
      const tokenDuration = sinon.stub(HostingMetrics.authTokenDuration, 'record')

      const span = endTrace(definition, record, error)

      assert.deepEqual(span.attributes, spanAttributes)
      assertMetric(requests, 1, {
        'auth.method': method,
        'auth.success': error === undefined,
      })
      assertMetric(tokenDuration, duration, { 'auth.method': method })
    }

    it('should set attributes and token metrics when getting an access token ends', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAccessToken,
        { scope: 'api.scope', method: 'client_secret' },
        { 'auth.scope': 'api.scope', 'auth.method': 'client_secret' },
        'client_secret'
      )
    })

    it('should set failed token metrics when acquiring an on-behalf-of token fails', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.acquireTokenOnBehalfOf,
        { scopes: ['api.scope'] },
        { 'auth.scopes': ['api.scope'] },
        'obo',
        new Error('token failure')
      )
    })

    it('should set failed token metrics when getting an access token fails', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAccessToken,
        { scope: 'api.scope', method: 'client_secret' },
        { 'auth.scope': 'api.scope', 'auth.method': 'client_secret' },
        'client_secret',
        new Error('token failure')
      )
    })

    it('should set attributes and token metrics when getting an agentic instance token ends', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAgenticInstanceToken,
        { agenticInstanceId: 'instance-id' },
        { 'agentic.instance_id': 'instance-id' },
        'agentic_instance'
      )
    })

    it('should set failed token metrics when getting an agentic instance token fails', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAgenticInstanceToken,
        { agenticInstanceId: 'instance-id' },
        { 'agentic.instance_id': 'instance-id' },
        'agentic_instance',
        new Error('token failure')
      )
    })

    it('should set attributes and token metrics when getting an agentic user token ends', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAgenticUserToken,
        { agenticInstanceId: 'instance-id', agenticUserId: 'user-id', scopes: ['api.scope'] },
        {
          'agentic.instance_id': 'instance-id',
          'agentic.user_id': 'user-id',
          'auth.scopes': ['api.scope'],
        },
        'agentic_user'
      )
    })

    it('should set failed token metrics when getting an agentic user token fails', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAgenticUserToken,
        { agenticInstanceId: 'instance-id', agenticUserId: 'user-id', scopes: ['api.scope'] },
        {
          'agentic.instance_id': 'instance-id',
          'agentic.user_id': 'user-id',
          'auth.scopes': ['api.scope'],
        },
        'agentic_user',
        new Error('token failure')
      )
    })

    it('should set default attributes and token metrics when authentication traces end', () => {
      const requests = sinon.stub(HostingMetrics.authTokenRequestsCounter, 'add')
      const tokenDuration = sinon.stub(HostingMetrics.authTokenDuration, 'record')
      const accessSpan = endTrace(AuthenticationTraceDefinitions.getAccessToken, AuthenticationTraceDefinitions.getAccessToken.record)
      const oboSpan = endTrace(
        AuthenticationTraceDefinitions.acquireTokenOnBehalfOf,
        AuthenticationTraceDefinitions.acquireTokenOnBehalfOf.record
      )
      const instanceSpan = endTrace(
        AuthenticationTraceDefinitions.getAgenticInstanceToken,
        AuthenticationTraceDefinitions.getAgenticInstanceToken.record
      )
      const userSpan = endTrace(
        AuthenticationTraceDefinitions.getAgenticUserToken,
        AuthenticationTraceDefinitions.getAgenticUserToken.record
      )

      assert.deepEqual(accessSpan.attributes, { 'auth.scope': '', 'auth.method': 'unknown' })
      assert.deepEqual(oboSpan.attributes, { 'auth.scopes': [] })
      assert.deepEqual(instanceSpan.attributes, { 'agentic.instance_id': '' })
      assert.deepEqual(userSpan.attributes, {
        'agentic.instance_id': '',
        'agentic.user_id': '',
        'auth.scopes': [],
      })
      assert.deepEqual(requests.getCalls().map(call => call.args), [
        [1, { 'auth.method': 'unknown', 'auth.success': true }],
        [1, { 'auth.method': 'obo', 'auth.success': true }],
        [1, { 'auth.method': 'agentic_instance', 'auth.success': true }],
        [1, { 'auth.method': 'agentic_user', 'auth.success': true }],
      ])
      assert.deepEqual(tokenDuration.getCalls().map(call => call.args), [
        [duration, { 'auth.method': 'unknown' }],
        [duration, { 'auth.method': 'obo' }],
        [duration, { 'auth.method': 'agentic_instance' }],
        [duration, { 'auth.method': 'agentic_user' }],
      ])
    })

    it('should use unknown token attributes when access token values are nullish', () => {
      assertTokenRequest(
        AuthenticationTraceDefinitions.getAccessToken,
        { scope: undefined, method: null },
        { 'auth.scope': 'unknown', 'auth.method': 'unknown' },
        'unknown'
      )
    })
  })

  describe('AuthorizationTraceDefinitions', () => {
    function assertAuthorization (
      definition: any,
      record: Record<string, unknown>,
      attributes: Record<string, unknown>
    ) {
      const span = endTrace(definition, record)

      assert.deepEqual(span.attributes, attributes)
    }

    it('should set authorization attributes when getting an Azure Bot token ends', () => {
      assertAuthorization(
        AuthorizationTraceDefinitions.azureBotToken,
        { handlerId: 'handler-id', connectionName: 'connection-name' },
        { 'auth.handler.id': 'handler-id', 'auth.connection.name': 'connection-name' }
      )
    })

    it('should set authorization attributes when getting an Azure Bot OBO token ends', () => {
      assertAuthorization(
        AuthorizationTraceDefinitions.azureBotOBOToken,
        { handlerId: 'handler-id', connectionName: 'connection-name', authScopes: ['api.scope'] },
        {
          'auth.handler.id': 'handler-id',
          'auth.connection.name': 'connection-name',
          'auth.scopes': ['api.scope'],
        }
      )
    })

    it('should set authorization attributes when signing out an Azure Bot user ends', () => {
      assertAuthorization(
        AuthorizationTraceDefinitions.azureBotSignout,
        { handlerId: 'handler-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'auth.handler.id': 'handler-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set authorization attributes when signing in an Azure Bot user ends', () => {
      assertAuthorization(
        AuthorizationTraceDefinitions.azureBotSignin,
        {
          handlerId: 'handler-id',
          connectionName: 'connection-name',
          status: 'approved',
          statusReason: 'valid token',
        },
        {
          'auth.handler.id': 'handler-id',
          'auth.handler.status': 'approved',
          'auth.handler.status.reason': 'valid token',
          'auth.connection.name': 'connection-name',
        }
      )
    })

    it('should set authorization attributes when getting an agentic token ends', () => {
      assertAuthorization(
        AuthorizationTraceDefinitions.agenticToken,
        { handlerId: 'handler-id', connectionName: 'connection-name', authScopes: ['api.scope'] },
        {
          'auth.handler.id': 'handler-id',
          'auth.connection.name': 'connection-name',
          'auth.scopes': ['api.scope'],
        }
      )
    })

    it('should set default attributes when authorization traces end', () => {
      const tokenSpan = endTrace(AuthorizationTraceDefinitions.azureBotToken, AuthorizationTraceDefinitions.azureBotToken.record)
      const oboSpan = endTrace(
        AuthorizationTraceDefinitions.azureBotOBOToken,
        AuthorizationTraceDefinitions.azureBotOBOToken.record
      )
      const signoutSpan = endTrace(
        AuthorizationTraceDefinitions.azureBotSignout,
        AuthorizationTraceDefinitions.azureBotSignout.record
      )
      const signinSpan = endTrace(
        AuthorizationTraceDefinitions.azureBotSignin,
        AuthorizationTraceDefinitions.azureBotSignin.record
      )
      const agenticSpan = endTrace(AuthorizationTraceDefinitions.agenticToken, AuthorizationTraceDefinitions.agenticToken.record)

      assert.deepEqual(tokenSpan.attributes, {
        'auth.handler.id': '',
        'auth.connection.name': '',
      })
      assert.deepEqual(oboSpan.attributes, {
        'auth.handler.id': '',
        'auth.connection.name': '',
        'auth.scopes': [],
      })
      assert.deepEqual(signoutSpan.attributes, {
        'auth.handler.id': '',
        'auth.connection.name': '',
        'activity.channel_id': '',
      })
      assert.deepEqual(signinSpan.attributes, {
        'auth.handler.id': '',
        'auth.handler.status': 'unknown',
        'auth.handler.status.reason': '',
        'auth.connection.name': '',
      })
      assert.deepEqual(agenticSpan.attributes, {
        'auth.handler.id': '',
        'auth.connection.name': '',
        'auth.scopes': [],
      })
    })

    it('should skip writing a sign-in link when no active authorization exists', async () => {
      const span = createSpan()
      const storage = {
        read: sinon.stub().resolves(undefined),
        write: sinon.stub(),
      }
      const actions = AuthorizationTraceDefinitions.azureBotSignin.actions!({ span } as any)

      await actions.link(storage as any)

      sinon.assert.calledOnce(storage.read)
      sinon.assert.notCalled(storage.write)
      assert.deepEqual(span.links, [])
    })

    it('should persist a sign-in link when an active authorization exists', async () => {
      const span = createSpan()
      const parentContext = { traceId: 'parent-trace-id', spanId: 'parent-span-id' }
      const storage = {
        read: sinon.stub().resolves({ status: 'pending', __link: parentContext }),
        write: sinon.stub().resolves(),
      }
      const actions = AuthorizationTraceDefinitions.azureBotSignin.actions!({ span } as any)

      await actions.link(storage as any)

      assert.deepEqual(span.links, [{ context: parentContext }])
      sinon.assert.calledOnceWithExactly(storage.write, {
        status: 'pending',
        __link: span.spanContext(),
      })
    })

    it('should use unknown authorization attributes when token values are nullish', () => {
      const span = endTrace(AuthorizationTraceDefinitions.azureBotToken, {
        handlerId: undefined,
        connectionName: null,
      })

      assert.deepEqual(span.attributes, {
        'auth.handler.id': 'unknown',
        'auth.connection.name': 'unknown',
      })
    })
  })

  describe('UserTokenClientTraceDefinitions', () => {
    function assertRequest (
      definition: any,
      operation: string,
      method: string,
      record: Record<string, unknown>,
      attributes: Record<string, unknown>
    ) {
      const requests = sinon.stub(HostingMetrics.userTokenClientRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.userTokenClientRequestDuration, 'record')
      const metricAttributes = {
        operation,
        'http.method': method,
        'http.status_code': 200,
      }

      const span = endTrace(definition, { ...record, httpStatusCode: 200 })

      assert.deepEqual(span.attributes, attributes)
      assertMetric(requests, 1, metricAttributes)
      assertMetric(requestDuration, duration, metricAttributes)
    }

    function assertDefaultRequest (
      definition: any,
      attributes: Record<string, unknown>,
      operation: string,
      method: string
    ) {
      const requests = sinon.stub(HostingMetrics.userTokenClientRequestsCounter, 'add')
      const requestDuration = sinon.stub(HostingMetrics.userTokenClientRequestDuration, 'record')
      const metricAttributes = {
        operation,
        'http.method': method,
        'http.status_code': 'unknown',
      }

      const span = endTrace(definition, definition.record)

      assert.deepEqual(span.attributes, attributes)
      assertMetric(requests, 1, metricAttributes)
      assertMetric(requestDuration, duration, metricAttributes)
    }

    it('should set attributes and request metrics when getting a user token ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.getUserToken,
        'get.user.token',
        'GET',
        { userId: 'user-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'user.id': 'user-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set attributes and request metrics when signing out ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.signOut,
        'sign.out',
        'DELETE',
        { userId: 'user-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'user.id': 'user-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set attributes and request metrics when getting a sign-in resource ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.getSignInResource,
        'get.sign.in.resource',
        'GET',
        { connectionName: 'connection-name' },
        { 'auth.connection.name': 'connection-name' }
      )
    })

    it('should set attributes and request metrics when exchanging a token ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.exchangeToken,
        'exchange.token',
        'POST',
        { userId: 'user-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'user.id': 'user-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set attributes and request metrics when getting a token or sign-in resource ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.getTokenOrSignInResource,
        'get.token.or.sign.in.resource',
        'GET',
        { userId: 'user-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'user.id': 'user-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set attributes and request metrics when getting token status ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.getTokenStatus,
        'get.token.status',
        'GET',
        { userId: 'user-id', channelId: 'msteams' },
        { 'user.id': 'user-id', 'activity.channel_id': 'msteams' }
      )
    })

    it('should set attributes and request metrics when getting AAD tokens ends', () => {
      assertRequest(
        UserTokenClientTraceDefinitions.getAadTokens,
        'get.aad.tokens',
        'POST',
        { userId: 'user-id', connectionName: 'connection-name', channelId: 'msteams' },
        {
          'user.id': 'user-id',
          'auth.connection.name': 'connection-name',
          'activity.channel_id': 'msteams',
        }
      )
    })

    it('should set default attributes and unknown HTTP status metrics when getting a user token ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.getUserToken,
        {
          'user.id': '',
          'auth.connection.name': '',
          'activity.channel_id': '',
        },
        'get.user.token',
        'GET'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when signing out ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.signOut,
        {
          'user.id': '',
          'auth.connection.name': '',
          'activity.channel_id': '',
        },
        'sign.out',
        'DELETE'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when getting a sign-in resource ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.getSignInResource,
        { 'auth.connection.name': '' },
        'get.sign.in.resource',
        'GET'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when exchanging a token ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.exchangeToken,
        {
          'user.id': '',
          'auth.connection.name': '',
          'activity.channel_id': '',
        },
        'exchange.token',
        'POST'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when getting a token or sign-in resource ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.getTokenOrSignInResource,
        {
          'user.id': '',
          'auth.connection.name': '',
          'activity.channel_id': '',
        },
        'get.token.or.sign.in.resource',
        'GET'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when getting token status ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.getTokenStatus,
        {
          'user.id': '',
          'activity.channel_id': '',
        },
        'get.token.status',
        'GET'
      )
    })

    it('should set default attributes and unknown HTTP status metrics when getting AAD tokens ends', () => {
      assertDefaultRequest(
        UserTokenClientTraceDefinitions.getAadTokens,
        {
          'user.id': '',
          'auth.connection.name': '',
          'activity.channel_id': '',
        },
        'get.aad.tokens',
        'POST'
      )
    })

    it('should use unknown attributes when user token client values are nullish', () => {
      const requests = { add: sinon.stub() }
      const requestDuration = { record: sinon.stub() }
      sinon.stub(HostingMetrics, 'userTokenClientRequestsCounter').value(requests as any)
      sinon.stub(HostingMetrics, 'userTokenClientRequestDuration').value(requestDuration as any)
      const span = endTrace(UserTokenClientTraceDefinitions.getUserToken, {
        userId: undefined,
        connectionName: null,
        channelId: undefined,
        httpStatusCode: null,
      })
      const metricAttributes = {
        operation: 'get.user.token',
        'http.method': 'GET',
        'http.status_code': 'unknown',
      }

      assert.deepEqual(span.attributes, {
        'user.id': 'unknown',
        'auth.connection.name': 'unknown',
        'activity.channel_id': 'unknown',
      })
      assertMetric(requests.add, 1, metricAttributes)
      assertMetric(requestDuration.record, duration, metricAttributes)
    })
  })
})
