import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity } from '@microsoft/agents-activity'
import fs from 'fs'

const echo = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Citation sample, send a message to see citations.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const json = fs.readFileSync('samples/basic/activityWithCitations.json', 'utf8')
  const act = Activity.fromJson(json)

  act.text = `Sure, you should override the default proxy settings[1] [2], when your proxy server requires authentication[3].

[1]: https://support.microsoft.com/en-us/windows/use-a-proxy-server-in-windows-03096c53-0554-4ffe-b6ab-8b1deee8dae1 "Use a proxy server in Windows"
[2]: https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/configure-proxy-server-settings "Configure proxy server settings - Windows Server"
[3]: cite:1 "Introduction Configuring proxy settings is a fundamental aspect..."`

  act.textFormat = 'markdown'
  await context.sendActivity(act)
})

startServer(echo)
