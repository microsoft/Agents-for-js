/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as msal from '@azure/msal-node'
import { Activity, ActivityTypes, CardAction } from '@microsoft/agents-activity-schema'
import { ConnectionSettings, CopilotStudioClient, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'
import pkg from '@microsoft/agents-copilotstudio-client/package.json' with { type: 'json' }
import readline from 'readline'
import open from 'open'
import os from 'os'
import path from 'path'

import { MsalCachePlugin } from './msalCachePlugin.js'

async function acquireToken (settings: ConnectionSettings): Promise<string> {
  const msalConfig = {
    auth: {
      clientId: settings.appClientId,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
    },
    cache: {
      cachePlugin: new MsalCachePlugin(path.join(os.tmpdir(), 'msal.usercache.json'))
    },
    system: {
      loggerOptions: {
        loggerCallback (loglevel: msal.LogLevel, message: string, containsPii: boolean) {
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
    openBrowser: async (url: string) => {
      await open(url)
    }
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

let copilotClient: CopilotStudioClient

const askQuestion = async () => {
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
      await askQuestion()
    }
  })
}

const main = async () => {
  const settings = loadCopilotStudioConnectionSettingsFromEnv()
  console.log(`Copilot Studio Client Version: ${pkg.version}, running with settings: ${JSON.stringify(settings)}`)
  const token = await acquireToken(settings)
  copilotClient = new CopilotStudioClient(settings, token)
  const replies = await copilotClient.startConversationAsync(true)
  replies.forEach((act: Activity) => {
    if (act.type === 'message') {
      console.log(act.text)
      console.log('\nSuggested Actions: ')
      act.suggestedActions?.actions.forEach((action: CardAction) => console.log(action.value))
    }
  })

  await askQuestion()
}

main().catch(e => console.log(e))
