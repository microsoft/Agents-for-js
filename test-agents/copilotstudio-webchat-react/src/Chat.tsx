/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Components } from 'botframework-webchat'
import { FluentThemeProvider } from 'botframework-webchat-fluent-theme'
import React, { useState, useEffect } from 'react'
import { CopilotStudioClient, CopilotStudioWebChat, CopilotStudioWebChatConnection, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'

import { acquireToken } from './acquireToken'

const { BasicWebChat, Composer } = Components

function Chat () {
  const [connection, setConnection] = useState<CopilotStudioWebChatConnection | null>(null)

  const agentsSettings = loadCopilotStudioConnectionSettingsFromEnv()
  const webchatSettings = { showTyping: true }

  useEffect(() => {
    (async () => {
      const token = await acquireToken(agentsSettings)
      const client = new CopilotStudioClient(agentsSettings, token)
      setConnection(CopilotStudioWebChat.createConnection(client, webchatSettings))
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
