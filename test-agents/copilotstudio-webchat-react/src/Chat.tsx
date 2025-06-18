import { Components } from 'botframework-webchat'
import { FluentThemeProvider } from 'botframework-webchat-fluent-theme'
import React, { useState, useEffect } from 'react'
import { CopilotStudioClient, CopilotStudioWebChat, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'

import { acquireToken } from './acquireToken'

const { BasicWebChat, Composer } = Components

const Chat = () => {
  const agentsSettings = loadCopilotStudioConnectionSettingsFromEnv()
  const webchatSettings = { showTyping: true }

  const [connection, setConnection] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const token = await acquireToken(agentsSettings)
      const client = new CopilotStudioClient(agentsSettings, token)
      setConnection(client
        ? CopilotStudioWebChat.createConnection(client, webchatSettings)
        : null)
    })()
  }, [])

  return connection
    ? (
      <FluentThemeProvider>
        <Composer directLine={connection}>
          <BasicWebChat />
        </Composer>
      </FluentThemeProvider>
      )
    : null
}

export default Chat
