// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpanNames, trace } from '@microsoft/agents-telemetry'
import { HostingMetrics } from './metrics'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { HandlerStorage } from '../app/auth/handlerStorage'

export const AgentApplicationTraceDefinitions = {
  run: trace.define({
    name: SpanNames.AGENTS_APP_RUN,
    record: {
      authorized: false,
      activity: Activity.fromObject({ type: 'unknown' }),
      routeMatched: false,
    },
    end ({ span, record, duration, error }) {
      const { activity } = record

      const attributes = {
        'activity.type': activity.type ?? 'unknown',
        'activity.channel_id': activity.channelId ?? 'unknown'
      }

      span.setAttributes({
        'route.authorized': record.authorized,
        'route.matched': record.routeMatched,
        ...attributes
      })

      HostingMetrics.turnsTotalCounter.add(1, attributes)
      HostingMetrics.turnDuration.record(duration, attributes)

      if (error) {
        HostingMetrics.turnsErrorsCounter.add(1, {
          'error.type': error instanceof Error ? error.constructor.name : typeof error
        })
      }
    }
  }),
  downloadFiles: trace.define({
    name: SpanNames.AGENTS_APP_DOWNLOAD_FILES,
    record: {
      attachmentsCount: 0,
    },
    end ({ span, record }) {
      span.setAttribute('agents.attachments.count', record.attachmentsCount ?? 0)
    }
  }),
  beforeTurn: trace.define({
    name: SpanNames.AGENTS_APP_BEFORE_TURN,
    record: {},
    end () {}
  }),
  routeHandler: trace.define({
    name: SpanNames.AGENTS_APP_ROUTE_HANDLER,
    record: {
      isInvoke: false,
      isAgentic: false,
    },
    end ({ span, record }) {
      span.setAttributes({
        'route.is_invoke': record.isInvoke,
        'route.is_agentic': record.isAgentic,
      })
    }
  }),
  afterTurn: trace.define({
    name: SpanNames.AGENTS_APP_AFTER_TURN,
    record: {},
    end () {}
  }),
}

export const TurnContextTraceDefinitions = {
  sendActivities: trace.define({
    name: SpanNames.TURN_SEND_ACTIVITIES,
    record: {
      activityCount: 0
    },
    actions: ({ span }) => ({
      recordActivity (activity: Activity) {
        span.addEvent('activity.sent', {
          'activity.id': activity.id ?? 'unknown',
          'activity.type': activity.type ?? 'unknown',
          'activity.delivery_mode': activity.deliveryMode ?? 'unknown'
        })
      }
    }),
    end ({ span, record }) {
      span.setAttribute('activity.count', record.activityCount)
    }
  }),
}

export const AgentClientTraceDefinitions = {
  postActivity: trace.define({
    name: SpanNames.AGENT_CLIENT_POST_ACTIVITY,
    record: {
      endpoint: '',
      clientId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      const attributes = {
        'target.endpoint': record.endpoint ?? 'unknown',
        'target.client_id': record.clientId ?? 'unknown',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      span.setAttributes(attributes)

      HostingMetrics.agentClientRequestsCounter.add(1, attributes)
      HostingMetrics.agentClientRequestDuration.record(duration, attributes)
    }
  }),
}

export const AdapterTraceDefinitions = {
  createConnectorClient: trace.define({
    name: SpanNames.ADAPTER_CREATE_CONNECTOR_CLIENT,
    record: {
      serviceUrl: '',
      scope: '',
      activityIsAgentic: false,
    },
    end ({ span, record }) {
      span.setAttributes({
        service_url: record.serviceUrl ?? 'unknown',
        'auth.scope': record.scope ?? 'unknown',
      })

      if (record.activityIsAgentic !== undefined) {
        span.setAttribute('activity.is_agentic', record.activityIsAgentic)
      }
    }
  }),
  createUserTokenClient: trace.define({
    name: SpanNames.ADAPTER_CREATE_USER_TOKEN_CLIENT,
    record: {
      tokenServiceEndpoint: '',
      authScope: '',
    },
    end ({ span, record }) {
      span.setAttributes({
        'token.service.endpoint': record.tokenServiceEndpoint ?? 'unknown',
        'auth.scope': record.authScope ?? 'unknown',
      })
    }
  }),
  sendActivities: trace.define({
    name: SpanNames.ADAPTER_SEND_ACTIVITIES,
    record: {
      activityCount: 0,
    },
    actions: ({ span }) => ({
      recordActivity (activity: Activity) {
        span.addEvent('activity.sent', {
          'activity.id': activity.id ?? 'unknown',
          'activity.type': activity.type ?? 'unknown',
          'activity.channel_id': activity.channelId ?? 'unknown',
          'activity.conversation_id': activity.conversation?.id ?? 'unknown',
        })
        HostingMetrics.activitiesSentCounter.add(1, {
          'activity.type': activity.type ?? 'unknown',
          'activity.channel_id': activity.channelId ?? 'unknown',
          'activity.conversation_id': activity.conversation?.id ?? 'unknown',
        })
      }
    }),
    end ({ span, record }) {
      span.setAttributes({
        'activity.count': record.activityCount,
      })
    }
  }),
  process: trace.define({
    name: SpanNames.ADAPTER_PROCESS,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
    },
    end ({ span, record, duration }) {
      const { activity } = record
      const attributes = {
        'activity.type': activity.type ?? 'unknown',
        'activity.channel_id': activity.channelId ?? 'unknown',
        'activity.delivery_mode': activity.deliveryMode ?? 'unknown',
        'activity.conversation_id': activity.conversation?.id ?? 'unknown',
      }

      span.setAttributes({
        ...attributes,
        'activity.is_agentic': activity.isAgenticRequest(),
      })

      HostingMetrics.adapterProcessDuration.record(duration, {
        'activity.type': attributes['activity.type'],
      })

      HostingMetrics.activitiesReceivedCounter.add(1, {
        'activity.type': attributes['activity.type'],
        'activity.channel_id': attributes['activity.channel_id']
      })
    }
  }),
  updateActivity: trace.define({
    name: SpanNames.ADAPTER_UPDATE_ACTIVITY,
    record: {
      activity: Activity.fromObject({ type: 'unknown' }),
    },
    end ({ span, record }) {
      span.setAttributes({
        'activity.id': record.activity.id ?? 'unknown',
        'activity.conversation_id': record.activity.conversation?.id ?? 'unknown',
      })

      HostingMetrics.activitiesUpdatedCounter.add(1, {
        'activity.channel_id': record.activity.channelId ?? 'unknown'
      })
    }
  }),
  deleteActivity: trace.define({
    name: SpanNames.ADAPTER_DELETE_ACTIVITY,
    record: {
      reference: {} as Partial<ConversationReference>,
    },
    end ({ span, record }) {
      const { reference } = record
      span.setAttributes({
        'activity.id': reference.activityId ?? 'unknown',
        'activity.conversation_id': reference.conversation?.id ?? 'unknown',
      })

      HostingMetrics.activitiesDeletedCounter.add(1, {
        'activity.channel_id': reference.channelId ?? 'unknown'
      })
    }
  }),
  continueConversation: trace.define({
    name: SpanNames.ADAPTER_CONTINUE_CONVERSATION,
    record: {
      botAppId: '',
      conversationId: '',
      isAgentic: false,
    },
    end ({ span, record }) {
      span.setAttributes({
        'bot.app_id': record.botAppId ?? 'unknown',
        'activity.conversation_id': record.conversationId ?? 'unknown',
        'activity.is_agentic': record.isAgentic,
      })
    }
  }),
}

export const ConnectorClientTraceDefinitions = {
  getConversations: trace.define({
    name: SpanNames.CONNECTOR_GET_CONVERSATIONS,
    record: {
      httpStatusCode: 'unknown',
    },
    end ({ record, duration }) {
      const attributes = {
        operation: 'get.conversations',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  getConversationMember: trace.define({
    name: SpanNames.CONNECTOR_GET_CONVERSATION_MEMBER,
    record: {
      httpStatusCode: 'unknown',
    },
    end ({ record, duration }) {
      const attributes = {
        operation: 'get.conversation_member',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  createConversation: trace.define({
    name: SpanNames.CONNECTOR_CREATE_CONVERSATION,
    record: {
      httpStatusCode: 'unknown',
    },
    end ({ record, duration }) {
      const attributes = {
        operation: 'create.conversation',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  replyToActivity: trace.define({
    name: SpanNames.CONNECTOR_REPLY_TO_ACTIVITY,
    record: {
      conversationId: '',
      activityId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'activity.conversation_id': record.conversationId ?? 'unknown',
        'activity.id': record.activityId ?? 'unknown',
      })

      const attributes = {
        operation: 'reply.to.activity',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  sendToConversation: trace.define({
    name: SpanNames.CONNECTOR_SEND_TO_CONVERSATION,
    record: {
      conversationId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttribute('activity.conversation_id', record.conversationId ?? 'unknown')

      const attributes = {
        operation: 'send.to.conversation',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  updateActivity: trace.define({
    name: SpanNames.CONNECTOR_UPDATE_ACTIVITY,
    record: {
      conversationId: '',
      activityId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'activity.conversation_id': record.conversationId ?? 'unknown',
        'activity.id': record.activityId ?? 'unknown',
      })

      const attributes = {
        operation: 'update.activity',
        'http.method': 'PUT',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  deleteActivity: trace.define({
    name: SpanNames.CONNECTOR_DELETE_ACTIVITY,
    record: {
      conversationId: '',
      activityId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'activity.conversation_id': record.conversationId ?? 'unknown',
        'activity.id': record.activityId ?? 'unknown',
      })

      const attributes = {
        operation: 'delete.activity',
        'http.method': 'DELETE',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  uploadAttachment: trace.define({
    name: SpanNames.CONNECTOR_UPLOAD_ATTACHMENT,
    record: {
      conversationId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttribute('activity.conversation_id', record.conversationId ?? 'unknown')

      const attributes = {
        operation: 'upload.attachment',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  getAttachmentInfo: trace.define({
    name: SpanNames.CONNECTOR_GET_ATTACHMENT_INFO,
    record: {
      attachmentId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttribute('attachment.id', record.attachmentId ?? 'unknown')

      const attributes = {
        operation: 'get.attachment.info',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
  getAttachment: trace.define({
    name: SpanNames.CONNECTOR_GET_ATTACHMENT,
    record: {
      attachmentId: '',
      viewId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'attachment.id': record.attachmentId ?? 'unknown',
        'view.id': record.viewId ?? 'unknown',
      })

      const attributes = {
        operation: 'get.attachment',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.connectorRequestsCounter.add(1, attributes)
      HostingMetrics.connectorRequestDuration.record(duration, attributes)
    }
  }),
}

export const StorageTraceDefinitions = {
  read: trace.define({
    name: SpanNames.STORAGE_READ,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'read',
        'storage.key.count': record.keyCount ?? 0
      }

      span.setAttributes(attributes)
      HostingMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
  write: trace.define({
    name: SpanNames.STORAGE_WRITE,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'write',
        'storage.key.count': record.keyCount ?? 0
      }

      span.setAttributes(attributes)
      HostingMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
  delete: trace.define({
    name: SpanNames.STORAGE_DELETE,
    record: {
      keyCount: 0,
    },
    end ({ span, record, duration }) {
      const attributes = {
        'storage.operation': 'delete',
        'storage.key.count': record.keyCount ?? 0
      }

      span.setAttributes(attributes)
      HostingMetrics.storageOperationDuration.record(duration, attributes)
    }
  }),
}

export const AuthenticationTraceDefinitions = {
  getAccessToken: trace.define({
    name: SpanNames.AUTHENTICATION_GET_ACCESS_TOKEN,
    record: {
      scope: '',
      method: 'unknown',
    },
    end ({ span, record, duration, error }) {
      const attributes = {
        'auth.scope': record.scope ?? 'unknown',
        'auth.method': record.method ?? 'unknown',
      }

      span.setAttributes(attributes)

      HostingMetrics.authTokenRequestsCounter.add(1, {
        'auth.method': attributes['auth.method'],
        'auth.success': error === undefined
      })

      HostingMetrics.authTokenDuration.record(duration, {
        'auth.method': attributes['auth.method']
      })
    }
  }),
  acquireTokenOnBehalfOf: trace.define({
    name: SpanNames.AUTHENTICATION_ACQUIRE_TOKEN_ON_BEHALF_OF,
    record: {
      scopes: [] as string[],
    },
    end ({ span, record, duration, error }) {
      const method = 'obo'
      span.setAttribute('auth.scopes', record.scopes)

      HostingMetrics.authTokenRequestsCounter.add(1, {
        'auth.method': method,
        'auth.success': error === undefined
      })

      HostingMetrics.authTokenDuration.record(duration, {
        'auth.method': method
      })
    }
  }),
  getAgenticInstanceToken: trace.define({
    name: SpanNames.AUTHENTICATION_GET_AGENTIC_INSTANCE_TOKEN,
    record: {
      agenticInstanceId: '',
    },
    end ({ span, record, duration, error }) {
      const method = 'agentic_instance'
      span.setAttribute('agentic.instance_id', record.agenticInstanceId ?? 'unknown')
      HostingMetrics.authTokenRequestsCounter.add(1, {
        'auth.method': method,
        'auth.success': error === undefined
      })

      HostingMetrics.authTokenDuration.record(duration, {
        'auth.method': method
      })
    }
  }),
  getAgenticUserToken: trace.define({
    name: SpanNames.AUTHENTICATION_GET_AGENTIC_USER_TOKEN,
    record: {
      agenticInstanceId: '',
      agenticUserId: '',
      scopes: [] as string[],
    },
    end ({ span, record, duration, error }) {
      const method = 'agentic_user'
      span.setAttributes({
        'agentic.instance_id': record.agenticInstanceId ?? 'unknown',
        'agentic.user_id': record.agenticUserId ?? 'unknown',
        'auth.scopes': record.scopes
      })
      HostingMetrics.authTokenRequestsCounter.add(1, {
        'auth.method': method,
        'auth.success': error === undefined
      })

      HostingMetrics.authTokenDuration.record(duration, {
        'auth.method': method
      })
    }
  }),
}

export const AuthorizationTraceDefinitions = {
  azureBotToken: trace.define({
    name: SpanNames.AUTHORIZATION_AZURE_BOT_TOKEN,
    record: {
      handlerId: '',
      connectionName: '',
      authFlow: '',
      authScopes: [] as string[],
    },
    end ({ span, record }) {
      span.setAttributes({
        'auth.handler.id': record.handlerId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
      })

      if (record.authFlow) {
        span.setAttribute('auth.flow', record.authFlow)
      }

      if (record.authScopes.length > 0) {
        span.setAttribute('auth.scopes', record.authScopes)
      }
    }
  }),
  azureBotSignout: trace.define({
    name: SpanNames.AUTHORIZATION_AZURE_BOT_SIGNOUT,
    record: {
      handlerId: '',
      connectionName: '',
      channelId: '',
    },
    end ({ span, record }) {
      span.setAttributes({
        'auth.handler.id': record.handlerId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })
    }
  }),
  azureBotSignin: trace.define({
    name: SpanNames.AUTHORIZATION_AZURE_BOT_SIGNIN,
    record: {
      handlerId: '',
      status: 'unknown',
      statusReason: '',
      connectionName: '',
    },
    actions: ({ span }) => ({
      async link (storage: HandlerStorage<any>) {
        const active = await storage.read()
        if (!active) {
          return
        }

        if (active.__link) {
          span.addLink({ context: active.__link })
        }

        active.__link = span.spanContext()
        await storage.write(active)
      }
    }),
    end ({ span, record }) {
      span.setAttributes({
        'auth.handler.id': record.handlerId ?? 'unknown',
        'auth.handler.status': record.status ?? 'unknown',
        'auth.handler.status.reason': record.statusReason ?? '',
        'auth.connection.name': record.connectionName ?? 'unknown',
      })
    }
  }),
  agenticToken: trace.define({
    name: SpanNames.AUTHORIZATION_AGENTIC_TOKEN,
    record: {
      handlerId: '',
      connectionName: '',
      authScopes: [] as string[],
    },
    end ({ span, record }) {
      span.setAttributes({
        'auth.handler.id': record.handlerId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'auth.scopes': record.authScopes
      })
    }
  }),
}

export const UserTokenClientTraceDefinitions = {
  getUserToken: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_GET_USER_TOKEN,
    record: {
      userId: '',
      connectionName: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'get.user.token',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  signOut: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_SIGN_OUT,
    record: {
      userId: '',
      connectionName: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'sign.out',
        'http.method': 'DELETE',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  getSignInResource: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_GET_SIGN_IN_RESOURCE,
    record: {
      connectionName: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttribute('auth.connection.name', record.connectionName ?? 'unknown')

      const attributes = {
        operation: 'get.sign.in.resource',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  exchangeToken: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_EXCHANGE_TOKEN,
    record: {
      userId: '',
      connectionName: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'exchange.token',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  getTokenOrSignInResource: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_GET_TOKEN_OR_SIGN_IN_RESOURCE,
    record: {
      userId: '',
      connectionName: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'get.token.or.sign.in.resource',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  getTokenStatus: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_GET_TOKEN_STATUS,
    record: {
      userId: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'get.token.status',
        'http.method': 'GET',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
  getAadTokens: trace.define({
    name: SpanNames.USER_TOKEN_CLIENT_GET_AAD_TOKENS,
    record: {
      userId: '',
      connectionName: '',
      channelId: '',
      httpStatusCode: 'unknown',
    },
    end ({ span, record, duration }) {
      span.setAttributes({
        'user.id': record.userId ?? 'unknown',
        'auth.connection.name': record.connectionName ?? 'unknown',
        'activity.channel_id': record.channelId ?? 'unknown',
      })

      const attributes = {
        operation: 'get.aad.tokens',
        'http.method': 'POST',
        'http.status_code': record.httpStatusCode ?? 'unknown'
      }

      HostingMetrics.userTokenClientRequestsCounter.add(1, attributes)
      HostingMetrics.userTokenClientRequestDuration.record(duration, attributes)
    }
  }),
}
