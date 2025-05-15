// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TurnState, MemoryStorage, TurnContext, AgentApplication, AgentApplicationBuilder }
  from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
import { ActivityTypes } from '@microsoft/agents-activity'

// interface ConversationState {
//   count: number;
// }
// type ApplicationTurnState = TurnState<ConversationState>

// const downloader = new AttachmentDownloader()

// Define storage and application
// const storage = new MemoryStorage()
// export const app = new AgentApplication<ApplicationTurnState>({
//   storage,
//   fileDownloaders: [downloader]
// })
const storage = new MemoryStorage()
export const app: AgentApplication<TurnState> = new AgentApplicationBuilder<TurnState>().withStorage(storage).build()

// Listen for user to say '/reset' and then delete conversation state
app.onMessage('/reset', async (context: TurnContext, state) => {
  state.deleteConversationState()
  await context.sendActivity('Ok I\'ve deleted the current conversation state.')
})

// app.onMessage('/count', async (context, state) => {
//   const count = state.conversation.count ?? 0
//   await context.sendActivity(`The count is ${count}`)
// })

// app.onMessage('/diag', async (context, state) => {
//   await state.load(context, storage)
//   await context.sendActivity(JSON.stringify(context.activity))
// })

app.onMessage('/state', async (context: TurnContext, state) => {
  await state.load(context, undefined)
  await context.sendActivity(JSON.stringify(state))
})

app.onMessage('/runtime', async (context: TurnContext, state) => {
  const runtime = {
    nodeversion: process.version,
    sdkversion: version
  }
  await context.sendActivity(JSON.stringify(runtime))
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state) => {
  await state.load(context, undefined)
  await context.sendActivity('Welcome to the conversation!')
})

// Listen for ANY message to be received. MUST BE AFTER ANY OTHER MESSAGE HANDLERS
// If there is more than one app.activity defined the first one is used and the others are dismissed
app.onActivity(ActivityTypes.Message, async (context: TurnContext, state) => {
  // Increment count state
  // let count = state.conversation.count ?? 0
  // state.conversation.count = ++count

  // await state.load(context, storage)
  let count: number = state.getValue('conversation.count') ?? 0
  state.setValue('conversation.count', ++count)
  // await state.save(context, storage)
  // Echo back users request
  await context.sendActivity(`[${count}] you said: ${context.activity.text}`)
})

// Listen with Regex. Regex should match an Activity Type
// app.onActivity(/^message/, async (context: TurnContext, state: ApplicationTurnState) => {
//   await context.sendActivity(`Matched with regex: ${context.activity.type}`)
// })

// Listen with a fuction
// app.onActivity(
//   async (context: TurnContext) => Promise.resolve(context.activity.type === 'message'),
//   async (context, state) => {
//     await context.sendActivity(`Matched function: ${context.activity.type}`)
//   }
// )

// Listen with an array of types
// app.onActivity(
//   // types
//   [/^message/, async (context: TurnContext) => Promise.resolve(context.activity.text === 'test')],
//   // handler
//   async (context, state) => {
//     await context.sendActivity(`You said: ${context.activity.text}`)
//   }
// )
