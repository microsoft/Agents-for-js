import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

// Only used for testing purposes to verify header propagation.
let incomingHeaders: Record<string, string> = {}

const echo = new AgentApplication<TurnState>({
  storage: new MemoryStorage(),
  headerPropagation (headers) {
    incomingHeaders = headers.incoming
    headers.propagate(['accept-encoding'])
    headers.add({ 'x-custom-header': 'CustomValue', 'x-override-header': 'OriginalValue' })
    headers.concat({ 'user-agent': 'CustomUserAgent/1.0' })
    headers.override({ 'x-override-header': 'OverriddenValue' })
  },
})

echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the HeaderPropagation sample, send a message to see the header propagation feature in action.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const headersReceived = Object.entries(incomingHeaders)
    .map(([key, value]) => `- **${key}**: ${value}`).join('\n  ')
  const headersSent = Object.entries(context.turnState.get('ConnectorClient').axiosInstance.defaults.headers)
    .filter(([_, e]) => typeof e === 'string')
    .map(([key, value]) => `- **${key}**: ${value}`).join('\n  ')

  await context.sendActivity(`
Headers received from the request:
  ${headersReceived}

Headers sent to outgoing request:
  ${headersSent}
  `)
})

startServer(echo)
