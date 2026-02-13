// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, RouteRank, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
import jwt from 'jsonwebtoken'
class AgenticAI extends AgentApplication<TurnState> {
  constructor () {
    super({
      startTypingTimer: true,
      storage: new MemoryStorage(),
      authorization: {
        agentic: { } // We have the type and scopes set in the .env file
      },
    })

    this.onConversationUpdate('membersAdded', this.welcome)
    this.onActivity('message', this.agentic, ['agentic'], undefined)
    this.onActivity('message', this.echo, [], RouteRank.Last)
  }

  welcome = async (ctx: TurnContext) => {
    await ctx.sendActivity(`AgenticAI running on node sdk ${version}.`)
  }

  agentic = async (ctx: TurnContext) => {
    const aauToken = await this.authorization.getToken(ctx, 'agentic')

    const decoded = jwt.decode(aauToken.token ?? '') as jwt.JwtPayload | null;
    const name = decoded?.name ?? 'unknown';
    const upn = decoded?.upn ?? 'unknown';
    const oid = decoded?.oid ?? 'unknown';
    const tid = decoded?.tid ?? 'unknown';  
    await ctx.sendActivity(`(Agentic) You said: ${ctx.activity.text}, user token length=${aauToken.token?.length ?? 0}\n\r\n\r\n\r\n\r**name**=${name}\n\r\n\r**upn**=${upn}\n\r\n\r**oid**=${oid}\n\r\n\r**tid**=${tid} `)
  }

  echo = async (ctx: TurnContext) => {
    await ctx.sendActivity(`You said: ${ctx.activity.text}`)
  }
}

startServer(new AgenticAI())
