# microsoft/agents-bot-hosting

## Overview

The `@microsoft/agents-bot-hosting` package provides the necessary tools and components to host and manage Microsoft Agents as Bots. This package includes a compative API to migrate from `botbuilder` from the BotFramework SDK.

## Installation

To install the package:

```sh
npm install @microsoft/agents-bot-hosting
```

## Example Usage

Create the Echo bot using the ActivityHandler

```ts
// bot.ts
import { ActivityHandler, MessageFactory } from '@microsoft/agents-bot-hosting'

export class EchoBot extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const replyText = `Echo Skill: ${context.activity.text}`
      await context.sendActivity(MessageFactory.text(replyText, replyText))
      await next()
    })
  }
}
```

Host the bot with express

```ts
// index.ts
import express, { Response } from 'express'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-bot-hosting'
import { EchoBot } from './bot'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)
const myBot = new EchoBot()

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

```
