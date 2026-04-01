// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Request, Response } from 'express'
import {
  startServer,
} from '@microsoft/agents-hosting-express'
import {
  AgentApplication,
  CloudAdapter,
  MemoryStorage,
  TurnContext,
  TurnState,
  CreateConversationOptionsBuilder,
  Proactive,
} from '@microsoft/agents-hosting'
import type { JwtPayload } from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Comma-separated list of app IDs permitted to call the proactive endpoints.
// In production, set this via an environment variable.
const ALLOWED_CALLERS: string[] = (process.env.ALLOWED_CALLERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!ALLOWED_CALLERS.length) {
  console.warn('[ProactiveAgent] ALLOWED_CALLERS is not configured — caller authentication is disabled. Set ALLOWED_CALLERS in production.')
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

const storage = new MemoryStorage()

/**
 * ProactiveAgent demonstrates the proactive messaging subsystem:
 *
 *  1. During a normal message turn, store the conversation reference and
 *     reply with the resulting conversation ID.
 *
 *  2. A POST /api/proactive/:conversationId endpoint continues that
 *     conversation. Any JSON body fields are forwarded to the handler via
 *     activity.value so the handler can read request-time parameters.
 *
 *  3. A POST /api/proactive/teams-channel endpoint creates a brand-new
 *     Teams conversation using CreateConversationOptionsBuilder.
 */
class ProactiveAgent extends AgentApplication<TurnState> {
  constructor () {
    super({
      storage,
      proactive: { storage },
    })

    // /teams-payload: reply with the JSON body needed to call POST /api/proactive/teams-channel
    this.onMessage('/teams-payload', async (ctx: TurnContext) => {
      const channelData = ctx.activity.channelData as Record<string, any> | undefined
      const payload: Record<string, string> = {
        userId: ctx.activity.from?.id ?? '',
        tenantId: channelData?.tenant?.id ?? (ctx.identity as any)?.tid ?? '',
      }
      // Include teamsChannelId only when messaging inside a Teams channel (not 1:1)
      const teamsChannelId = channelData?.channel?.id
      if (teamsChannelId) {
        payload.teamsChannelId = teamsChannelId
      }
      await ctx.sendActivity('```json\n' + JSON.stringify(payload, null, 2) + '\n```')
    })

    // On every message: store the conversation reference and echo the ID back.
    this.onActivity('message', async (ctx: TurnContext) => {
      const convId = await this.proactive.storeConversation(ctx)
      await ctx.sendActivity(
        `Your conversation has been stored. Use this ID to trigger a proactive message:\n\`${convId}\``
      )
    })
  }
}

// ---------------------------------------------------------------------------
// Middleware: AllowCallers
// ---------------------------------------------------------------------------

/**
 * Middleware that validates the caller's app ID against ALLOWED_CALLERS.
 * When ALLOWED_CALLERS is empty the check is skipped (development convenience).
 * Attach after authorizeJWT so that req.user is already populated.
 */
function requireAllowedCaller (req: Request, res: Response, next: express.NextFunction) {
  if (!ALLOWED_CALLERS.length) {
    return next()
  }
  const user = (req as any).user as JwtPayload | undefined
  const callerId = user?.appid ?? user?.azp ?? user?.sub ?? ''
  if (!ALLOWED_CALLERS.includes(callerId)) {
    res.status(403).json({ error: `Caller '${callerId}' is not in the allowed callers list.` })
    return
  }
  next()
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const agent = new ProactiveAgent()
const server = startServer(agent)

// The adapter is used to drive proactive turns on the additional endpoints.
const adapter = agent.adapter as CloudAdapter

// ---------------------------------------------------------------------------
// POST /api/proactive/:conversationId
//
// Continues a stored conversation. Any JSON body is forwarded to the handler
// via activity.value so callers can pass runtime parameters (e.g. query args).
// ---------------------------------------------------------------------------
server.post('/api/proactive/continue/:conversationId', requireAllowedCaller, async (req: Request, res: Response) => {
  const { conversationId } = req.params as { conversationId: string }

  try {
    await agent.proactive.continueConversation(
      adapter,
      conversationId,
      async (ctx: TurnContext, _state: TurnState) => {
        // The HTTP request body is available as activity.value inside the turn.
        const args = ctx.activity.value as Record<string, unknown> | undefined

        const message = args?.message
          ? `Proactive message: ${args.message}`
          : 'You have a proactive message!'

        await ctx.sendActivity(message)
      },
      undefined,
      // Pass the HTTP request body as activity.value so the handler can
      // read request-time parameters (mirrors the ContinueConversationValueType
      // pattern from the C# spec).
      {
        value: req.body ?? {},
        valueType: Proactive.ContinueConversationValueType,
      }
    )
    res.status(200).json({ status: 'ok', conversationId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(err instanceof Error && message.includes('not found') ? 404 : 500).json({ error: message })
  }
})

// ---------------------------------------------------------------------------
// POST /api/proactive/teams-channel
//
// Creates a brand-new Teams 1:1 conversation using CreateConversationOptionsBuilder.
// Expected body: { userId, tenantId, teamsChannelId? }
// ---------------------------------------------------------------------------
server.post('/api/proactive/teams-channel', requireAllowedCaller, async (req: Request, res: Response) => {
  const { userId, tenantId, teamsChannelId } = req.body as {
    userId?: string
    tenantId?: string
    teamsChannelId?: string
  }

  if (!userId || !tenantId) {
    res.status(400).json({ error: 'userId and tenantId are required.' })
    return
  }

  const clientId = process.env.clientId ?? process.env.CLIENT_ID ?? ''

  try {
    const builder = CreateConversationOptionsBuilder
      .create(clientId, 'msteams')
      .withUser(userId)
      .withTenantId(tenantId)

    if (teamsChannelId) {
      builder.withTeamsChannelId(teamsChannelId)
    }

    const opts = builder.build()

    const conv = await agent.proactive.createConversation(
      adapter,
      opts,
      async (ctx: TurnContext) => {
        await ctx.sendActivity('Hello! This is a proactive message from the Proactive Agent.')
      }
    )

    res.status(200).json({ status: 'ok', conversationId: conv.reference.conversation.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})
