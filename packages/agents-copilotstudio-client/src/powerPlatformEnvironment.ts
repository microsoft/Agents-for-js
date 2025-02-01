/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotType } from './botType'
import { ConnectionSettings } from './connectionSettings'
import { PowerPlatformCloud } from './powerPlatformCloud'

const ApiVersion: string = '2022-03-01-preview'

export function getCopilotStudioConnectionUrl (
  settings: ConnectionSettings,
  conversationId?: string,
  botType: BotType = BotType.Published,
  cloud: PowerPlatformCloud = PowerPlatformCloud.Prod,
  cloudBaseAddress?: string
): string {
  if (cloud === PowerPlatformCloud.Other && (!cloudBaseAddress || !cloudBaseAddress.trim())) {
    throw new Error('cloudBaseAddress must be provided when PowerPlatformCloud is Other')
  }

  if (!settings.environmentId || settings.environmentId.trim() === '') {
    throw new Error('EnvironmentId must be provided')
  }

  if (!settings.botIdentifier || settings.botIdentifier.trim() === '') {
    throw new Error('BotIdentifier must be provided')
  }

  if (settings.cloud && settings.cloud !== PowerPlatformCloud.Unknown) {
    cloud = settings.cloud
  }

  if (cloud === PowerPlatformCloud.Other) {
    if (cloudBaseAddress && isValidUri(cloudBaseAddress)) {
      cloud = PowerPlatformCloud.Other
    } else if (settings.customPowerPlatformCloud && isValidUri(settings.customPowerPlatformCloud)) {
      cloudBaseAddress = settings.customPowerPlatformCloud
    } else {
      throw new Error(
        'Either customPowerPlatformCloud or cloudBaseAddress must be provided when PowerPlatformCloud is Other'
      )
    }
  }

  if (settings.copilotBotType) {
    botType = settings.copilotBotType
  }

  cloudBaseAddress = cloudBaseAddress ?? 'api.unknown.powerplatform.com'

  const host = getEnvironmentEndpoint(cloud, settings.environmentId, cloudBaseAddress)
  return createUri(settings.botIdentifier, host, botType, conversationId)
}

function isValidUri (uri: string): boolean {
  try {
    const newUri = new URL(uri)
    return !!newUri
  } catch {
    return false
  }
}

function createUri (
  botIdentifier: string,
  host: string,
  botType: BotType,
  conversationId?: string
): string {
  const botPathName = botType === BotType.Published ? 'dataverse-backed' : 'prebuilt'

  const url = new URL(`https://${host}`)
  url.searchParams.set('api-version', ApiVersion)

  if (!conversationId) {
    url.pathname = `/copilotstudio/${botPathName}/authenticated/bots/${botIdentifier}/conversations`
  } else {
    url.pathname = `/copilotstudio/${botPathName}/authenticated/bots/${botIdentifier}/conversations/${conversationId}`
  }

  return url.toString()
}

function getEnvironmentEndpoint (
  cloud: PowerPlatformCloud,
  environmentId: string,
  cloudBaseAddress?: string
): string {
  if (cloud === PowerPlatformCloud.Other && (!cloudBaseAddress || !cloudBaseAddress.trim())) {
    throw new Error('cloudBaseAddress must be provided when PowerPlatformCloud is Other')
  }

  cloudBaseAddress = cloudBaseAddress ?? 'api.unknown.powerplatform.com'

  const normalizedResourceId = environmentId.toLowerCase().replaceAll('-', '')
  const idSuffixLength = getIdSuffixLength(cloud)
  const hexPrefix = normalizedResourceId.substring(0, normalizedResourceId.length - idSuffixLength)
  const hexSuffix = normalizedResourceId.substring(normalizedResourceId.length - idSuffixLength)

  return `${hexPrefix}.${hexSuffix}.environment.${getEndpointSuffix(cloud, cloudBaseAddress)}`
}

function getEndpointSuffix (
  category: PowerPlatformCloud,
  cloudBaseAddress: string
): string {
  switch (category) {
    case PowerPlatformCloud.Local:
      return 'api.powerplatform.localhost'
    case PowerPlatformCloud.Exp:
      return 'api.exp.powerplatform.com'
    case PowerPlatformCloud.Dev:
      return 'api.dev.powerplatform.com'
    case PowerPlatformCloud.Prv:
      return 'api.prv.powerplatform.com'
    case PowerPlatformCloud.Test:
      return 'api.test.powerplatform.com'
    case PowerPlatformCloud.Preprod:
      return 'api.preprod.powerplatform.com'
    case PowerPlatformCloud.FirstRelease:
    case PowerPlatformCloud.Prod:
      return 'api.powerplatform.com'
    case PowerPlatformCloud.GovFR:
      return 'api.gov.powerplatform.microsoft.us'
    case PowerPlatformCloud.Gov:
      return 'api.gov.powerplatform.microsoft.us'
    case PowerPlatformCloud.High:
      return 'api.high.powerplatform.microsoft.us'
    case PowerPlatformCloud.DoD:
      return 'api.appsplatform.us'
    case PowerPlatformCloud.Mooncake:
      return 'api.powerplatform.partner.microsoftonline.cn'
    case PowerPlatformCloud.Ex:
      return 'api.powerplatform.eaglex.ic.gov'
    case PowerPlatformCloud.Rx:
      return 'api.powerplatform.microsoft.scloud'
    case PowerPlatformCloud.Other:
      return cloudBaseAddress
    default:
      throw new Error(`Invalid cluster category value: ${category}`)
  }
}

function getIdSuffixLength (cloud: PowerPlatformCloud): number {
  switch (cloud) {
    case PowerPlatformCloud.FirstRelease:
    case PowerPlatformCloud.Prod:
      return 2
    default:
      return 1
  }
}
