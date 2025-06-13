/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { acquireToken } from './acquireToken.js'

try {
  const response = await fetch('/agentSettings')
  if (!response.ok) {
    throw new Error(`Unable to load agent settings (${response.status})`)
  }

  const agentsSettings = await response.json()
  const token = await acquireToken(agentsSettings)
  const client = new window.Agents.CopilotStudioClient(agentsSettings, token)

  window.WebChat.renderWebChat(
    {
      directLine: window.Agents.CopilotStudioWebChat.createConnection(client, {
        showTyping: true,
      }),
    },
    document.getElementById('webchat')
  )

  document.querySelector('#webchat > *').focus()
} catch (err) {
  console.error('Failed to initialize:', err)
}
