// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import { SlackAgentExtension } from '../src/slackAgentExtension.js'
import { SlackApi, SlackApiKey } from '../src/api/slackApi.js'
import { SlackStream } from '../src/api/slackStream.js'
import { ActivityTypes } from '@microsoft/agents-activity'
import type { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting'

function makeApp() {
  const routes: Array<{ selector: Function; handler: Function }> = []
  const beforeTurnHandlers: Array<Function> = []
  return {
    onTurn: sinon.stub().callsFake((_event: string, handler: Function) => {
      beforeTurnHandlers.push(handler)
    }),
    addRoute: sinon.stub().callsFake((selector: Function, handler: Function) => {
      routes.push({ selector, handler })
    }),
    _routes: routes,
    _beforeTurnHandlers: beforeTurnHandlers,
    runBeforeTurn: async (context: TurnContext, state: TurnState) => {
      for (const handler of beforeTurnHandlers) {
        const result = await handler(context, state)
        if (!result) return false
      }
      return true
    },
    runRoute: async (context: TurnContext, state: TurnState) => {
      for (const { selector, handler } of routes) {
        if (await selector(context)) {
          await handler(context, state)
          return true
        }
      }
      return false
    },
  } as unknown as AgentApplication<TurnState> & {
    _routes: any[]
    _beforeTurnHandlers: any[]
    runBeforeTurn: Function
    runRoute: Function
  }
}

function makeContext(overrides: Partial<{ channelId: string; type: string; text: string; channelData: unknown }>): TurnContext {
  const { channelId = 'slack', type = ActivityTypes.Message, text = '', channelData = {} } = overrides
  return {
    activity: { channelId, type, text, channelData },
    turnState: new Map(),
  } as unknown as TurnContext
}

describe('SlackAgentExtension', () => {
  let app: ReturnType<typeof makeApp>

  beforeEach(() => {
    app = makeApp()
  })

  describe('constructor', () => {
    it('registers a beforeTurn handler', () => {
      new SlackAgentExtension(app as any)
      sinon.assert.calledOnceWithMatch(app.onTurn as sinon.SinonStub, 'beforeTurn', sinon.match.func)
    })

    it('injects SlackApi when ApiToken is in channelData', async () => {
      new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: { ApiToken: 'xoxb-abc' } })
      await (app as any).runBeforeTurn(ctx, {})
      assert.ok(ctx.turnState.get(SlackApiKey) instanceof SlackApi)
    })

    it('injects SlackApi from SLACK_TOKEN env when channelData has no token', async () => {
      process.env.SLACK_TOKEN = 'xoxb-env'
      new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: {} })
      await (app as any).runBeforeTurn(ctx, {})
      assert.ok(ctx.turnState.get(SlackApiKey) instanceof SlackApi)
      delete process.env.SLACK_TOKEN
    })

    it('does not inject SlackApi when no token available', async () => {
      delete process.env.SLACK_TOKEN
      new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: {} })
      await (app as any).runBeforeTurn(ctx, {})
      assert.equal(ctx.turnState.get(SlackApiKey), undefined)
    })

    it('before-turn hook always returns true', async () => {
      new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: {} })
      const result = await (app as any).runBeforeTurn(ctx, {})
      assert.equal(result, true)
    })

    it('does not inject SlackApi when channelId is not slack', async () => {
      process.env.SLACK_TOKEN = 'xoxb-env'
      new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelId: 'msteams', channelData: { ApiToken: 'xoxb-abc' } })
      await (app as any).runBeforeTurn(ctx, {})
      assert.equal(ctx.turnState.get(SlackApiKey), undefined)
      delete process.env.SLACK_TOKEN
    })
  })

  describe('onSlackMessage(handler)', () => {
    it('registers a route that matches Slack message activities', async () => {
      const ext = new SlackAgentExtension(app as any)
      const handler = sinon.stub()
      ext.onSlackMessage(handler)

      const ctx = makeContext({ channelId: 'slack', type: ActivityTypes.Message })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(matched)
    })

    it('does not match non-Slack activities', async () => {
      const ext = new SlackAgentExtension(app as any)
      ext.onSlackMessage(sinon.stub())

      const ctx = makeContext({ channelId: 'msteams', type: ActivityTypes.Message })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(!matched)
    })
  })

  describe('onSlackMessage(text, handler)', () => {
    it('matches when activity text equals the string', async () => {
      const ext = new SlackAgentExtension(app as any)
      const handler = sinon.stub()
      ext.onSlackMessage('hello', handler)

      const ctx = makeContext({ text: 'hello' })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(matched)
    })

    it('does not match different text', async () => {
      const ext = new SlackAgentExtension(app as any)
      ext.onSlackMessage('hello', sinon.stub())

      const ctx = makeContext({ text: 'world' })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(!matched)
    })
  })

  describe('onSlackMessage(regex, handler)', () => {
    it('matches when activity text matches the regex', async () => {
      const ext = new SlackAgentExtension(app as any)
      ext.onSlackMessage(/^hello/i, sinon.stub())

      const ctx = makeContext({ text: 'Hello there' })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(matched)
    })

    it('does not match when text does not match regex', async () => {
      const ext = new SlackAgentExtension(app as any)
      ext.onSlackMessage(/^hello/i, sinon.stub())

      const ctx = makeContext({ text: 'goodbye' })
      const matched = await (app as any).runRoute(ctx, {})
      assert.ok(!matched)
    })
  })

  describe('createStream', () => {
    it('throws SlackApiTokenMissing when no SlackApi in turnState', () => {
      const ext = new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: { SlackMessage: { event: { channel: 'C1', thread_ts: '1.2' } } } })
      assert.throws(
        () => ext.createStream(ctx),
        (err: Error) => {
          assert.ok(err.message.includes('-160002'))
          return true
        }
      )
    })

    it('returns a SlackStream when SlackApi is present', () => {
      const ext = new SlackAgentExtension(app as any)
      const ctx = makeContext({ channelData: { SlackMessage: { event: { channel: 'C1', thread_ts: '1.2' } } } })
      ctx.turnState.set(SlackApiKey, new SlackApi('token'))

      const stream = ext.createStream(ctx)
      assert.ok(stream instanceof SlackStream)
    })
  })
})
