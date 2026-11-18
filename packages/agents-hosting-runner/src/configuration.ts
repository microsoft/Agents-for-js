// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ExceptionHelper } from '@microsoft/agents-activity'
import {
  createJsonFileConfigurationSource,
  loadAuthConfigFromEnv,
  preloadConfigurationSources
} from '@microsoft/agents-hosting'
import { validateRunnerIdentity } from './authentication'
import { Errors } from './errorHelper'

function property (value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') {
    return undefined
  }
  return Object.entries(value).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
}

export async function preloadRunnerConfiguration (directory: string) {
  const filePath = join(directory, 'appsettings.json')
  let exists = true
  try {
    await stat(filePath)
  } catch (cause) {
    if (cause !== null && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') {
      exists = false
    } else {
      throw ExceptionHelper.generateException(
        Error, Errors.SettingsReadFailed, cause instanceof Error ? cause : undefined, { filePath }
      )
    }
  }
  const result = exists ? await createJsonFileConfigurationSource(filePath).load() : undefined
  await preloadConfigurationSources(result
    ? [{
        source: {
          name: filePath,
          async load () {
            return result
          }
        },
        mode: 'fallback'
      }]
    : [])

  const authentication = property(property(property(result, 'value'), 'AgentRunner'), 'Authentication')
  const configuredIssuers = property(authentication, 'AdditionalEntraIssuers')
  if (configuredIssuers !== undefined &&
    (!Array.isArray(configuredIssuers) || !configuredIssuers.every(value => typeof value === 'string'))) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidAdditionalIssuers)
  }
  const issuers = new Map<number, string>()
  if (Array.isArray(configuredIssuers)) {
    for (const [index, issuer] of configuredIssuers.entries()) {
      issuers.set(index, issuer)
    }
  }
  for (const [name, value] of Object.entries(process.env)) {
    const match = /^AgentRunner__Authentication__AdditionalEntraIssuers__(\d+)$/i.exec(name)
    if (match && value !== undefined) {
      issuers.set(Number(match[1]), value)
    }
  }
  const additionalIssuers = [...issuers.values()]
  const authConfig = loadAuthConfigFromEnv('ServiceConnection')
  validateRunnerIdentity(authConfig, additionalIssuers)
  return { authConfig, additionalIssuers }
}
