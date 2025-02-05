/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as msal from '@azure/msal-node'
import { Activity, ActivityTypes, CardAction } from '@microsoft/agents-activity-schema'
import { CopilotStudioClient, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilot-studio'
import readline from 'readline'
import os from 'os'
import path from 'path'
import { MsalCachePlugin } from './msalCachePlugin.js'
import { exec } from 'child_process'

const openBrowser = async (url: string) => {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`  // Windows
    : process.platform === 'darwin'
      ? `open "${url}"`    // macOS
      : `xdg-open "${url}"`  // Linux

  exec(command, (error) => {
    if (error) {
      console.error('Error opening browser:', error)
    }
  })
}

async function acquireToken(): Promise<string> {
  const msalConfig = {
    auth: {
      clientId: process.env.appClientId || '',
      authority: `https://login.microsoftonline.com/${process.env.tenantId}`
    },
    cache: {
      cachePlugin: new MsalCachePlugin(path.join(os.tmpdir(), 'msal.usercache.json'))
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel: msal.LogLevel, message: string, containsPii: boolean) {
          console.log(message)
        },
        piiLoggingEnabled: false,
        logLevel: msal.LogLevel.Verbose,
      }
    }
  }
  const pca = new msal.PublicClientApplication(msalConfig)
  const tokenRequest = {
    scopes: ['https://api.powerplatform.com/.default'],
    redirectUri: 'http://localhost',
    openBrowser
  }
  let token
  try {
    const accounts = await pca.getAllAccounts()
    if (accounts.length > 0) {
      const response2 = await pca.acquireTokenSilent({ account: accounts[0], scopes: tokenRequest.scopes })
      token = response2.accessToken
    } else {
      const response = await pca.acquireTokenInteractive(tokenRequest)
      token = response.accessToken
    }
  } catch (error) {
    console.error('Error acquiring token interactively:', error)
    const response = await pca.acquireTokenInteractive(tokenRequest)
    token = response.accessToken
  }
  return token
}

const createClient = async (): Promise<CopilotStudioClient> => {
  const settings = loadCopilotStudioConnectionSettingsFromEnv()
  const token = await acquireToken()
  const copilotClient = new CopilotStudioClient(settings, token)
  return copilotClient
}

const askQuestion = (copilotClient: CopilotStudioClient) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('\n>>>: ', async (answer) => {
    if (answer.toLowerCase() === 'exit') {
      rl.close()
    } else {
      const replies = await copilotClient.askQuestionAsync(answer)
      replies.forEach((act: Activity) => {
        if (act.type === ActivityTypes.Message) {
          console.log(`\n${act.text}`)
          act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
        } else if (act.type === ActivityTypes.EndOfConversation) {
          console.log(`\n${act.text}`)
          rl.close()
        }
      })
      askQuestion(copilotClient)
    }
  })
}

(async () => {
  const copilotClient = await createClient()
  const replies = await copilotClient.startConversationAsync(true)
  replies.forEach((act: Activity) => {
    if (act.type === 'message') {
      console.log(act.text)
      console.log('\nSuggested Actions: ')
      act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
    }
  })
  askQuestion(copilotClient)
})()
