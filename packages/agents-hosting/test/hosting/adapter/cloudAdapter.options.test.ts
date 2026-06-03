// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import {
  AuthConfiguration,
  CloudAdapter,
  CloudAdapterOptions,
  MsalConnectionManager,
  Request,
  TurnContext,
  UserTokenClient
} from '../../../src'
import { ConnectorClient } from '../../../src/connector-client/connectorClient'
import { Response } from 'express'
import { JwtPayload } from 'jsonwebtoken'

/**
 * Tests for the CloudAdapter options surface ported from Agents-for-net PR #838:
 *   - `validateServiceUrl` (host comparison between `serviceurl` claim and Activity.serviceUrl)
 *   - `emitStackTrace` (default onTurnError stack-trace toggle)
 *   - Logging the invalid-activity payload on 400 BadRequest
 *   - Env-var fallback
 */
describe('CloudAdapter options (PR #838 parity)', () => {
  const authentication: AuthConfiguration = {
    tenantId: 'tenantId',
    clientId: 'clientId',
    clientSecret: 'clientSecret',
    issuers: ['issuers']
  }

  // --- Test scaffolding ----------------------------------------------------

  function buildAdapter (options?: CloudAdapterOptions) {
    const mockConnectorClient = sinon.createStubInstance(ConnectorClient)
    const mockConnectionManager = sinon.createStubInstance(MsalConnectionManager)
    const mockUserTokenClient = sinon.createStubInstance(UserTokenClient)

    const adapter = new CloudAdapter(authentication, undefined, undefined, options)
    const adapterAny = adapter as any
    adapterAny.connectionManager = mockConnectionManager
    sinon.stub(adapterAny, 'createConnectorClient').returns(mockConnectorClient)
    sinon.stub(adapterAny, 'createUserTokenClient').returns(mockUserTokenClient)
    sinon.stub(adapterAny, 'createConnectorClientWithIdentity').returns(mockConnectorClient)
    return adapter
  }

  function buildRes (): Partial<Response> {
    return {
      headersSent: false,
      writableEnded: false,
      status: sinon.stub().returnsThis() as any,
      send: sinon.stub().returnsThis() as any,
      end: sinon.stub().returnsThis() as any,
      setHeader: sinon.stub().returnsThis() as any
    }
  }

  function buildReq (user?: JwtPayload): Request {
    return {
      headers: {},
      body: {},
      user
    } as Request
  }

  function makeActivity (type: ActivityTypes, serviceUrl: string | undefined) {
    const a = new Activity(type)
    a.conversation = { id: 'test-conversation-id' }
    a.serviceUrl = serviceUrl
    a.channelId = 'test-channel'
    a.from = { id: 'u', name: 'u' }
    a.recipient = { id: 'b', name: 'b' }
    return a
  }

  let stubFromObject: sinon.SinonStub | undefined
  afterEach(() => {
    if (stubFromObject) {
      stubFromObject.restore()
      stubFromObject = undefined
    }
    sinon.restore()
  })

  // --- validateServiceUrl --------------------------------------------------

  describe('validateServiceUrl', () => {
    it('matching hosts pass when enabled', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://smba.trafficmanager.net/other/' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('mismatched hosts return 400 when enabled', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
      sinon.assert.calledWith((res as any).status, 400)
    })

    it('mismatched hosts do not return 400 when disabled (warn only)', async () => {
      const adapter = buildAdapter({ validateServiceUrl: false })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('passes when identity has no serviceurl claim', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ aud: 'clientId' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('passes when activity has no serviceUrl', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, undefined)
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://smba.trafficmanager.net/teams/' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('mismatched hosts on Invoke activity return 400 when enabled', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Invoke, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
      sinon.assert.calledWith((res as any).status, 400)
    })

    it('malformed claim URI returns 400 when enabled', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'not-a-valid-uri' } as any), res as Response, async () => {})
      sinon.assert.calledWith((res as any).status, 400)
    })

    it('matches hosts regardless of port differences (.NET Uri.Host parity)', async () => {
      // .NET Uri.Host excludes port; we use URL.hostname for the same semantic.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://channel.example.com/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://channel.example.com:8443/teams/' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('rejects when claim has a userinfo-spoofed host', async () => {
      // Ensures the WHATWG URL parser correctly identifies evil.com as the host,
      // not victim.com — defends against userinfo-based bypass attempts.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://victim.com/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://victim.com@evil.com/' } as any), res as Response, async () => {})
      sinon.assert.calledWith((res as any).status, 400)
    })

    it('empty-string claim value is treated as a malformed claim and rejected when enabled', async () => {
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: '' } as any), res as Response, async () => {})
      sinon.assert.calledWith((res as any).status, 400)
    })

    it('non-string claim value (type confusion) is ignored', async () => {
      // JwtPayload has an open index signature; non-string claim shapes should
      // not throw and should not enforce.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 12345 } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('passes when serviceurl claim is missing entirely (.NET PR #838 parity)', async () => {
      // .NET PR #838 test `ProcessAsync_ValidateServiceUrl_NoServiceUrlClaim_ShouldSucceed`
      // documents this: an identity without a `serviceurl` claim bypasses
      // validation. This is intentional — some auth flows (e.g., skills) do
      // not include the claim and pre-existing channels would break.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ aud: 'clientId' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('passes when serviceurl claim is explicitly null (same as missing)', async () => {
      // `null` is not a string, so the type guard treats it identically to a
      // missing claim — validation is bypassed.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: null } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('passes when the authenticated identity itself is missing (anonymous request)', async () => {
      // No JWT on the request → no identity → no claim to compare → pass.
      const adapter = buildAdapter({ validateServiceUrl: true })
      const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq(undefined), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('malformed activity URI does not return 400 when disabled (warn only)', async () => {
      const adapter = buildAdapter({ validateServiceUrl: false })
      const activity = makeActivity(ActivityTypes.Message, 'not-a-valid-uri')
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
      const res = buildRes()
      await adapter.process(buildReq({ serviceurl: 'https://smba.trafficmanager.net/teams/' } as any), res as Response, async () => {})
      sinon.assert.neverCalledWith((res as any).status, 400)
    })

    it('env var CloudAdapterOptions__validateServiceUrl=true enables enforcement when no options arg is passed', async () => {
      const prev = process.env.CloudAdapterOptions__validateServiceUrl
      process.env.CloudAdapterOptions__validateServiceUrl = 'true'
      try {
        const adapter = buildAdapter()
        const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
        stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
        const res = buildRes()
        await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
        sinon.assert.calledWith((res as any).status, 400)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validateServiceUrl
        else process.env.CloudAdapterOptions__validateServiceUrl = prev
      }
    })

    it('explicit options arg overrides env var', async () => {
      const prev = process.env.CloudAdapterOptions__validateServiceUrl
      process.env.CloudAdapterOptions__validateServiceUrl = 'true'
      try {
        const adapter = buildAdapter({ validateServiceUrl: false })
        const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
        stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
        const res = buildRes()
        await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
        sinon.assert.neverCalledWith((res as any).status, 400)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validateServiceUrl
        else process.env.CloudAdapterOptions__validateServiceUrl = prev
      }
    })

    it('unknown CloudAdapterOptions__* env var is ignored (no throw, no enforcement)', async () => {
      // Defends against silent typos: an unrecognized property name
      // (here a genuinely unknown option) must not affect behavior.
      const prev = process.env.CloudAdapterOptions__unknownOption
      process.env.CloudAdapterOptions__unknownOption = 'true'
      try {
        const adapter = buildAdapter()
        const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
        stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
        const res = buildRes()
        await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
        sinon.assert.neverCalledWith((res as any).status, 400)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__unknownOption
        else process.env.CloudAdapterOptions__unknownOption = prev
      }
    })

    it('matches CloudAdapterOptions__* env var case-insensitively (aligns with envParser convention)', async () => {
      // Some hosts uppercase env-var names; the loader must accept any casing
      // of the property suffix while keeping the prefix invariant.
      const prev = process.env.CloudAdapterOptions__VALIDATESERVICEURL
      process.env.CloudAdapterOptions__VALIDATESERVICEURL = 'true'
      try {
        const adapter = buildAdapter()
        const activity = makeActivity(ActivityTypes.Message, 'https://smba.trafficmanager.net/teams/')
        stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)
        const res = buildRes()
        await adapter.process(buildReq({ serviceurl: 'https://evil.example.com/callback/' } as any), res as Response, async () => {})
        sinon.assert.calledWith((res as any).status, 400)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__VALIDATESERVICEURL
        else process.env.CloudAdapterOptions__VALIDATESERVICEURL = prev
      }
    })
  })

  // --- emitStackTrace ------------------------------------------------------

  describe('emitStackTrace', () => {
    async function invokeDefaultOnTurnError (adapter: CloudAdapter, err: Error) {
      const context = {
        sendTraceActivity: sinon.stub().resolves(undefined),
        sendActivity: sinon.stub().resolves(undefined)
      } as unknown as TurnContext
      await adapter.onTurnError(context, err)
    }

    async function captureLog (fn: () => Promise<void>): Promise<string> {
      const debugModule = await import('debug')
      const prev = (debugModule.default as any).disable() // returns previous namespace string
      ;(debugModule.default as any).enable('agents:cloud-adapter:*')
      const calls: string[] = []
      const origStderr = process.stderr.write.bind(process.stderr)
      ;(process.stderr.write as any) = (chunk: any) => { calls.push(String(chunk)); return true }
      try {
        await fn()
      } finally {
        ;(process.stderr.write as any) = origStderr
        ;(debugModule.default as any).disable()
        if (prev) (debugModule.default as any).enable(prev)
      }
      return calls.join('')
    }

    it('omits stack from log line by default', async () => {
      const adapter = buildAdapter()
      const err = new Error('boom')
      err.stack = 'STACK-MARKER\n  at fake'
      const out = await captureLog(() => invokeDefaultOnTurnError(adapter, err))
      assert.ok(out.includes('boom'), `should log error message, got: ${out}`)
      assert.ok(!out.includes('STACK-MARKER'), 'should NOT include stack by default')
    })

    it('includes stack in log line when enabled', async () => {
      const adapter = buildAdapter({ emitStackTrace: true })
      const err = new Error('boom')
      err.stack = 'STACK-MARKER\n  at fake'
      const out = await captureLog(() => invokeDefaultOnTurnError(adapter, err))
      assert.ok(out.includes('STACK-MARKER'), `should include stack when emitStackTrace=true, got: ${out}`)
    })

    it('honors CloudAdapterOptions__emitStackTrace env var', async () => {
      const prev = process.env.CloudAdapterOptions__emitStackTrace
      process.env.CloudAdapterOptions__emitStackTrace = 'true'
      try {
        const adapter = buildAdapter()
        const err = new Error('boom')
        err.stack = 'ENV-STACK-MARKER\n  at fake'
        const out = await captureLog(() => invokeDefaultOnTurnError(adapter, err))
        assert.ok(out.includes('ENV-STACK-MARKER'), `env var should enable stack trace, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__emitStackTrace
        else process.env.CloudAdapterOptions__emitStackTrace = prev
      }
    })
  })

  // --- Invalid activity logging -------------------------------------------

  describe('invalid activity logging', () => {
    it('logs the truncated activity body when returning 400 for invalid activity', async () => {
      const adapter = buildAdapter()
      // Force isValidChannelActivity to fail by stubbing fromObject to return
      // an activity with no `type` (which the validator rejects).
      const activity = new Activity('message' as ActivityTypes)
      ;(activity as any).type = undefined
      activity.conversation = { id: 'cv1' }
      activity.id = 'identifiable-activity-id'
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      const debugModule = await import('debug')
      const prev = (debugModule.default as any).disable()
      ;(debugModule.default as any).enable('agents:cloud-adapter:*')
      const calls: string[] = []
      const origStderr = process.stderr.write.bind(process.stderr)
      ;(process.stderr.write as any) = (chunk: any) => { calls.push(String(chunk)); return true }
      const res = buildRes()
      try {
        await adapter.process(buildReq(), res as Response, async () => {})
      } finally {
        ;(process.stderr.write as any) = origStderr
        ;(debugModule.default as any).disable()
        if (prev) (debugModule.default as any).enable(prev)
      }

      sinon.assert.calledWith((res as any).status, 400)
      const joined = calls.join('')
      assert.ok(joined.includes('invalid activity body'), `should log the invalid-activity warning, got: ${joined}`)
      assert.ok(joined.includes('identifiable-activity-id'), 'should include serialized activity body in log')
    })

    it('sanitizes control characters and U+2028/U+2029 from logged activity body (log-forging defense)', async () => {
      const adapter = buildAdapter()
      const activity = new Activity('message' as ActivityTypes)
      ;(activity as any).type = undefined
      activity.conversation = { id: 'cv1' }
      activity.id = 'forge-attempt'
      // Attacker-controlled field with newlines, NULs, and U+2028.
      ;(activity as any).text = 'first\nFAKE_LINE\x00\u2028INJECTED\r\nALSO'
      stubFromObject = sinon.stub(Activity, 'fromObject').returns(activity)

      const debugModule = await import('debug')
      const prev = (debugModule.default as any).disable()
      ;(debugModule.default as any).enable('agents:cloud-adapter:*')
      const calls: string[] = []
      const origStderr = process.stderr.write.bind(process.stderr)
      ;(process.stderr.write as any) = (chunk: any) => { calls.push(String(chunk)); return true }
      try {
        await adapter.process(buildReq(), buildRes() as Response, async () => {})
      } finally {
        ;(process.stderr.write as any) = origStderr
        ;(debugModule.default as any).disable()
        if (prev) (debugModule.default as any).enable(prev)
      }

      const joined = calls.join('')
      assert.ok(joined.includes('invalid activity body'), 'should log the invalid-activity warning')
      // JSON.stringify escapes \n/\r/\x00 but leaves U+2028 untouched on Node.
      // sanitizeForLog in truncateActivityForLog must replace U+2028 with '?'.
      assert.ok(!joined.includes('\u2028'), 'U+2028 must not appear in the log output')
    })
  })

  // --- Unknown env var diagnostics ----------------------------------------

  describe('unknown env var diagnostics', () => {
    async function captureLogDuring (fn: () => void | Promise<void>): Promise<string> {
      const debugModule = await import('debug')
      const prev = (debugModule.default as any).disable()
      ;(debugModule.default as any).enable('agents:cloud-adapter:*')
      const calls: string[] = []
      const origStderr = process.stderr.write.bind(process.stderr)
      ;(process.stderr.write as any) = (chunk: any) => { calls.push(String(chunk)); return true }
      // console.warn writes to stderr by default, but stub it too in case the
      // test runner has redirected it.
      const origConsoleWarn = console.warn
      console.warn = (...args: any[]) => { calls.push(args.map(String).join(' ') + '\n') }
      try {
        await fn()
      } finally {
        console.warn = origConsoleWarn
        ;(process.stderr.write as any) = origStderr
        ;(debugModule.default as any).disable()
        if (prev) (debugModule.default as any).enable(prev)
      }
      return calls.join('')
    }

    // Each test that exercises the "warn once" dedup uses a unique env var
    // name so it is immune to prior warnings accumulated in the per-process
    // dedup set. This avoids needing a module-level reset hook in production
    // source (which knip/etc. would flag as unused public API).
    let uniqueCounter = 0
    function uniqueEnvKey (base: string): string {
      uniqueCounter += 1
      return `CloudAdapterOptions__${base}_${process.pid}_${Date.now()}_${uniqueCounter}`
    }

    it('warns with a "did you mean" suggestion for a near-miss CloudAdapterOptions__ env var', async () => {
      const prev = process.env.CloudAdapterOptions__validateServiceUrls
      process.env.CloudAdapterOptions__validateServiceUrls = 'true'
      try {
        const out = await captureLogDuring(() => { buildAdapter() })
        assert.ok(out.includes('Unknown CloudAdapterOptions env var'), `should warn on unknown env var, got: ${out}`)
        assert.ok(out.includes('Did you mean'), `should include suggestion hint, got: ${out}`)
        assert.ok(out.includes('CloudAdapterOptions__validateServiceUrl'), `should suggest validateServiceUrl, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validateServiceUrls
        else process.env.CloudAdapterOptions__validateServiceUrls = prev
      }
    })

    it('warns without a suggestion for a CloudAdapterOptions__ env var that is not close to any known option', async () => {
      const prev = process.env.CloudAdapterOptions__totallyMadeUpOption
      process.env.CloudAdapterOptions__totallyMadeUpOption = 'true'
      try {
        const out = await captureLogDuring(() => { buildAdapter() })
        assert.ok(out.includes('Unknown CloudAdapterOptions env var'), `should warn on unknown env var, got: ${out}`)
        assert.ok(!out.includes('Did you mean'), `should NOT suggest anything for distant names, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__totallyMadeUpOption
        else process.env.CloudAdapterOptions__totallyMadeUpOption = prev
      }
    })

    it('suggests validateServiceUrl for the common dropped-syllable typo validServiceUrl', async () => {
      const prev = process.env.CloudAdapterOptions__validServiceUrl
      process.env.CloudAdapterOptions__validServiceUrl = 'true'
      try {
        const out = await captureLogDuring(() => { buildAdapter() })
        assert.ok(out.includes('Unknown CloudAdapterOptions env var'), `should warn on unknown env var, got: ${out}`)
        assert.ok(out.includes('Did you mean "CloudAdapterOptions__validateServiceUrl"'), `should suggest validateServiceUrl, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validServiceUrl
        else process.env.CloudAdapterOptions__validServiceUrl = prev
      }
    })

    it('accepts a fully uppercased CloudAdapterOptions__ prefix (case-insensitive prefix matching)', async () => {
      const key = 'CLOUDADAPTEROPTIONS__VALIDATESERVICEURL'
      const prev = process.env[key]
      process.env[key] = 'true'
      try {
        const adapter = buildAdapter()
        // No warning should fire; option should be picked up.
        assert.equal((adapter as any)._options.validateServiceUrl, true)
      } finally {
        if (prev === undefined) delete process.env[key]
        else process.env[key] = prev
      }
    })

    it('warns when a known CloudAdapterOptions__ key has an unrecognized boolean value', async () => {
      const prev = process.env.CloudAdapterOptions__validateServiceUrl
      process.env.CloudAdapterOptions__validateServiceUrl = 'yes'
      try {
        const out = await captureLogDuring(() => { buildAdapter() })
        assert.ok(out.includes('Ignored CloudAdapterOptions__validateServiceUrl=yes'),
          `should warn on unparseable boolean value, got: ${out}`)
        assert.ok(out.includes('expected one of true/false/1/0'),
          `should describe expected values, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validateServiceUrl
        else process.env.CloudAdapterOptions__validateServiceUrl = prev
      }
    })

    it('does NOT warn for a whitespace-only value on a known CloudAdapterOptions__ key (parseBooleanEnv treats it as unset)', async () => {
      const prev = process.env.CloudAdapterOptions__validateServiceUrl
      process.env.CloudAdapterOptions__validateServiceUrl = '   '
      try {
        const out = await captureLogDuring(() => { buildAdapter() })
        assert.ok(!out.includes('Ignored CloudAdapterOptions__validateServiceUrl'),
          `whitespace-only value should not produce an "Ignored" warning, got: ${out}`)
      } finally {
        if (prev === undefined) delete process.env.CloudAdapterOptions__validateServiceUrl
        else process.env.CloudAdapterOptions__validateServiceUrl = prev
      }
    })

    it('dedups repeated unknown-env warnings across multiple CloudAdapter instances', async () => {
      // Use a unique env key so the per-process dedup set doesn't already
      // contain a prior warning for this key from an earlier test run.
      const key = uniqueEnvKey('dedupCheck')
      process.env[key] = 'true'
      try {
        const out = await captureLogDuring(() => {
          buildAdapter()
          buildAdapter()
          buildAdapter()
        })
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`\\[agents:cloud-adapter\\] Unknown CloudAdapterOptions env var: ${escapedKey}`, 'g')
        const matches = out.match(re) ?? []
        assert.equal(matches.length, 1, `expected exactly 1 warning across 3 adapters, got ${matches.length}: ${out}`)
      } finally {
        delete process.env[key]
      }
    })
  })
})
