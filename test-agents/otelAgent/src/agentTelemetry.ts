// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metrics, trace } from '@opentelemetry/api'

export class AgentTelemetry {
  public static tracer = trace.getTracer('OTelAgent', '1.0.0')
  private static meter = metrics.getMeter('OTelAgent', '1.0.0')

  public static messageProcessedCounter = this.meter.createCounter('agent.messages.processed.count', {
    unit: 'messages',
    description: 'Number of messages processed by the agent'
  })

  public static routeExecutedCounter = this.meter.createCounter('agent.routes.executed.count', {
    unit: 'routes',
    description: 'Number of routes executed by the agent'
  })

  public static messageProcessingDuration = this.meter.createHistogram('agent.message.processing.duration', {
    unit: 'ms',
    description: 'Duration of message processing in milliseconds'
  })

  public static routeExecutionDuration = this.meter.createHistogram('agent.route.execution.duration', {
    unit: 'ms',
    description: 'Duration of route execution in milliseconds'
  })

  public static activeConversations = this.meter.createUpDownCounter('agent.conversations.active.count', {
    unit: 'conversations',
    description: 'Number of active conversations'
  })
}
