/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentType } from './agentType'
import { ConnectionSettings } from './connectionSettings'
import { PowerPlatformCloud } from './powerPlatformCloud'
import { PrebuiltBotStrategy } from './strategies/prebuiltBotStrategy'
import { PublishedBotStrategy } from './strategies/publishedBotStrategy'

/**
 * Generates the connection URL for Copilot Studio.
 * @param settings - The connection settings.
 * @param conversationId - Optional conversation ID.
 * @returns The connection URL.
 * @throws Will throw an error if required settings are missing or invalid.
 */
export function getCopilotStudioConnectionUrl (
  settings: ConnectionSettings,
  conversationId?: string
): string {
  let cloudValue: PowerPlatformCloud = PowerPlatformCloud.Prod

  if (settings.directConnectUrl?.trim()) {
    if (!isValidUri(settings.directConnectUrl)) {
      throw new Error('directConnectUrl must be a valid URL')
    }

    // FIX for Missing Tenant ID
    if (settings.directConnectUrl.toLocaleLowerCase().includes('tenants/00000000-0000-0000-0000-000000000000')) {
      // Direct connection cannot be used, ejecting and forcing the normal settings flow:
      return getCopilotStudioConnectionUrl({ ...settings, directConnectUrl: '' }, conversationId)
    }

    return createURL(settings.directConnectUrl, conversationId).href
  }

  const isNotEmptyCloud = settings.cloud && settings.cloud.toString().trim() !== ''
  const isNotEmptyCustomPowerPlatformCloud = settings.customPowerPlatformCloud !== undefined && settings.customPowerPlatformCloud.trim() !== ''

  if (isNotEmptyCloud && !Object.values(PowerPlatformCloud).includes(settings.cloud!)) {
    throw new Error('Invalid PowerPlatformCloud enum key')
  }

  const cloudSetting = isNotEmptyCloud ? settings.cloud! : PowerPlatformCloud.Unknown

  if (cloudSetting === PowerPlatformCloud.Other && isNotEmptyCustomPowerPlatformCloud) {
    throw new Error('customPowerPlatformCloud must be provided when PowerPlatformCloud is Other')
  }

  if (!settings.environmentId?.trim()) {
    throw new Error('EnvironmentId must be provided')
  }

  if (settings.agentIdentifier === undefined || settings.agentIdentifier.trim() === '') {
    throw new Error('AgentIdentifier must be provided')
  }

  if (cloudSetting !== PowerPlatformCloud.Unknown) {
    cloudValue = cloudSetting
  }

  if (cloudSetting === PowerPlatformCloud.Other) {
    if (isNotEmptyCustomPowerPlatformCloud && isValidUri(settings.customPowerPlatformCloud!)) {
      cloudValue = PowerPlatformCloud.Other
    } else {
      throw new Error(
        'customPowerPlatformCloud must be provided when PowerPlatformCloud is Other'
      )
    }
  }

  let agentType: AgentType

  if (settings.copilotAgentType && settings.copilotAgentType.toString().trim() !== '') {
    if (!Object.values(AgentType).includes(settings.copilotAgentType)) {
      throw new Error('Invalid AgentType enum key')
    } else {
      agentType = settings.copilotAgentType
    }
  } else {
    agentType = AgentType.Published
  }

  settings.customPowerPlatformCloud = isNotEmptyCustomPowerPlatformCloud ? settings.customPowerPlatformCloud : 'api.unknown.powerplatform.com'

  const host = getEnvironmentEndpoint(cloudValue, settings.environmentId, settings.customPowerPlatformCloud)

  const strategy = {
    [AgentType.Published]: () => new PublishedBotStrategy({
      host,
      schema: settings.agentIdentifier!,
    }),
    [AgentType.Prebuilt]: () => new PrebuiltBotStrategy({
      host,
      identifier: settings.agentIdentifier!,
    }),
  }[agentType]()

  return strategy.getConversationUrl(conversationId)
}

function isValidUri (uri: string): boolean {
  try {
    const newUri = new URL(uri)
    return !!newUri
  } catch {
    return false
  }
}

function createURL (base: string, conversationId?: string): URL {
  const url = new URL(base)

  if (!url.searchParams.has('api-version')) {
    url.searchParams.append('api-version', '2022-03-01-preview')
  }

  if (url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }

  if (url.pathname.includes('/conversations')) {
    url.pathname = url.pathname.substring(0, url.pathname.indexOf('/conversations'))
  }

  url.pathname = `${url.pathname}/conversations`
  if (conversationId) {
    url.pathname = `${url.pathname}/${conversationId}`
  }

  return url
}

function getEnvironmentEndpoint (
  cloud: PowerPlatformCloud,
  environmentId: string,
  cloudBaseAddress?: string
): URL {
  if (cloud === PowerPlatformCloud.Other && (!cloudBaseAddress || !cloudBaseAddress.trim())) {
    throw new Error('cloudBaseAddress must be provided when PowerPlatformCloud is Other')
  }

  cloudBaseAddress = cloudBaseAddress ?? 'api.unknown.powerplatform.com'

  const normalizedResourceId = environmentId.toLowerCase().replaceAll('-', '')
  const idSuffixLength = getIdSuffixLength(cloud)
  const hexPrefix = normalizedResourceId.substring(0, normalizedResourceId.length - idSuffixLength)
  const hexSuffix = normalizedResourceId.substring(normalizedResourceId.length - idSuffixLength)

  return new URL(`https://${hexPrefix}.${hexSuffix}.environment.${getEndpointSuffix(cloud, cloudBaseAddress)}`)
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
