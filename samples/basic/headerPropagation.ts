import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, ConnectorClient, MemoryStorage, TurnContext, TurnState, UserTokenClient } from '@microsoft/agents-hosting'

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
  const connectorClient = context.turnState.get<ConnectorClient>(context.adapter.ConnectorClientKey)
  const userTokenClient = context.turnState.get<UserTokenClient>(context.adapter.UserTokenClientKey)

  await context.sendActivity(`
**📨 Incoming Request Headers:**
${formatHeaders(incomingHeaders)}

**📤 Outgoing Request Headers:**

*ConnectorClient:*
${formatHeaders(connectorClient.axiosInstance.defaults.headers)}

*UserTokenClient:*
${formatHeaders(userTokenClient.client.defaults.headers)}
  `)
})

function formatHeaders (headers: Record<string, any>) {
  return Object.entries(headers)
    .filter(([_, e]) => typeof e === 'string')
    .map(([key, value]) => `- \`${key}\`: ${value}`)
    .join('\n\n')
}

startServer(echo)
