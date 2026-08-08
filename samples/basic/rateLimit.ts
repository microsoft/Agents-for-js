import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, MemoryStorage, RateLimitResult, TurnContext } from '@microsoft/agents-hosting'

const isScenario = (options: string[]) => async (context: TurnContext) => options.includes(context.activity.text?.trim() || '')

const storage = new MemoryStorage()

const app = new AgentApplication({
  storage,
  rateLimit: [
    // Activity limit: 3 messages per 10 seconds per user
    {
      scope: context => context.activity.from?.id,
      appliesTo: isScenario(['1', '3']),
      activityTypes: [ActivityTypes.Message],
      limit: 3,
      windowMs: 10_000,
      message: (_context, result) => rateLimitMessage('Activity limit reached', result)
    },
    // Conversation limit: 5 messages per 10 seconds per conversation
    {
      scope: context => context.activity.conversation?.id,
      appliesTo: isScenario(['2', '3']),
      activityTypes: [ActivityTypes.Message],
      limit: 5,
      windowMs: 10_000,
      message: (_context, result) => rateLimitMessage('Conversation limit reached', result)
    }
  ]
})

app.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity(
    'Welcome to the Rate Limit sample. Send one option several times quickly:\n1. Activity limit\n2. Conversation limit\n3. Activity and conversation limits'
  )
})

app.onMessage(isScenario(['3']), async (context: TurnContext) => {
  await echo(context, 'Activity and conversation limits')
})

app.onMessage(isScenario(['1']), async (context: TurnContext) => {
  await echo(context, 'Activity limit')
})

app.onMessage(isScenario(['2']), async (context: TurnContext) => {
  await echo(context, 'Conversation limit')
})

app.onActivity('message', async (context: TurnContext) => {
  await echo(context, 'Choose 1, 2, or 3')
})

async function echo (context: TurnContext, label: string): Promise<void> {
  await context.sendActivity(`${label}: ${context.activity.text}`)
}

function rateLimitMessage (prefix: string, result: RateLimitResult): string {
  const seconds = Math.ceil(result.retryAfterMs / 1000)
  return `${prefix}. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

startServer(app)
