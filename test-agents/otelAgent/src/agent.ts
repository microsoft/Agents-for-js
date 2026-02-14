// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { SpanStatusCode, type Span } from '@opentelemetry/api'
import { AgentTelemetry } from './agentTelemetry'

class OTelAgent extends AgentApplication<TurnState> {
  private tracer = AgentTelemetry.tracer

  constructor () {
    super({ startTypingTimer: true, storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this.welcome)
    this.onActivity('message', this.echo)
  }

  welcome = async (ctx: TurnContext) => {
    return this.tracer.startActiveSpan('agent.welcome_message', async (span: Span) => {
      try {
        span.setAttribute('conversation.id', ctx.activity.conversation?.id ?? '')
        span.setAttribute('channel.id', ctx.activity.channelId ?? '')
        span.setAttribute('members.added.count', ctx.activity.membersAdded?.length ?? 0)

        ctx.activity.membersAdded?.forEach((member) => {
          if (member.id !== ctx.activity.recipient?.id) {
            span.addEvent(
              'member.added',
              {
                'member.id': member.id,
                'member.name': member.name,
              },
              Date.now())
          }
        })
        await ctx.sendActivity('Hello and Welcome!')

        AgentTelemetry.routeExecutedCounter.add(1,
          {
            'route.type': 'welcome_message',
            'conversation.id': ctx.activity.conversation?.id ?? 'unknown'
          }
        )
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error)
          span.addEvent(
            'exception',
            {
              'exception.name': error.name,
              'exception.message': error.message,
              'exception.stacktrace': error.stack,
            },
            Date.now())
        }
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    })
  }

  echo = async (ctx: TurnContext) => {
    return this.tracer.startActiveSpan('agent.message_handler', async (span: Span) => {
      const t0 = performance.now()
      try {
        span.setAttribute('conversation.id', ctx.activity.conversation?.id ?? '')
        span.setAttribute('channel.id', ctx.activity.channelId ?? '')
        span.setAttribute('message.text.length', ctx.activity.text?.length ?? 0)
        span.setAttribute('user.id', ctx.activity.from?.id ?? '')

        span.addEvent(
          'message.received',
          {
            'message.id': ctx.activity.id,
            'message.text': ctx.activity.text,
            'user.id': ctx.activity.from?.id,
            'channel.id': ctx.activity.channelId,
          },
          Date.now())
        // OUTBOUND HTTP CALL
        span.addEvent(
          'external_call.started',
          {
            'app.http.target': 'https://www.bing.com'
          },
          Date.now())
        const res = await fetch('https://www.bing.com', { method: 'GET' })
        const elapsedMs = performance.now() - t0
        span.addEvent(
          'external_call.completed',
          {
            'app.http.status_code': res.status,
            'app.http.elapsed_ms': elapsedMs
          },
          Date.now())

        await ctx.sendActivity(`You said now: ${ctx.activity.text}`)
        span.addEvent(
          'response.sent',
          undefined,
          Date.now())

        const processedMs = performance.now() - t0
        AgentTelemetry.messageProcessedCounter.add(1,
          {
            'agent.type': this.constructor.name,
            status: 'success'
          }
        )
        AgentTelemetry.messageProcessingDuration.record(processedMs,
          {
            'conversation.id': ctx.activity.conversation?.id ?? 'unknown',
            'channel.id': ctx.activity.channelId ?? 'unknown'
          })
        AgentTelemetry.routeExecutedCounter.add(1,
          {
            'route.type': 'message_handler',
            'conversation.id': ctx.activity.conversation?.id ?? 'unknown'
          })
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error)
          span.addEvent(
            'exception',
            {
              'exception.name': error.name,
              'exception.message': error.message,
              'exception.stacktrace': error.stack, // don't do this in production!
            },
            Date.now())

          const elapsedMs = performance.now() - t0
          AgentTelemetry.messageProcessingDuration.record(elapsedMs,
            {
              'conversation.id': ctx.activity.conversation?.id ?? 'unknown',
              'channel.id': ctx.activity.channelId ?? 'unknown',
              status: 'error'
            })
        }
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    })
  }
}

startServer(new OTelAgent())
