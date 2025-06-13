/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import path from 'path'

import { loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'
import pkg from '@microsoft/agents-copilotstudio-client/package.json' with { type: 'json' }
import express from 'express'

import { dependency } from './util.js'

const PORT = process.env.PORT || 3978
const settings = loadCopilotStudioConnectionSettingsFromEnv()
const settingsString = JSON.stringify(settings, null, 2)

const app = express()

// Serves all static assets from the "public" directory to support the website UI.
app.use(express.static(path.resolve(import.meta.dirname, '../public')))

// Make the Copilot Studio Client browser library available from node_modules.
app.use(dependency('@microsoft/agents-copilotstudio-client/browser'))

// Serves the Copilot Studio Client settings to the browser.
// CAUTION: This endpoint is intended to serve non-sensitive information.
//          In a real production environment, if you require to serve sensitive information,
//          always use a secure configuration management to avoid exposing it directly.
app.get('/agentSettings', (_, res) => {
  res.json(settings)
})

app.listen(PORT, () => {
  console.log(`WebChat is running at http://localhost:${PORT}`)
  console.log(`\nCopilot Studio Client Version: ${pkg.version}, running with settings: ${settingsString}`)
  console.log('\nPress Ctrl+C to stop the server')
})
