/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { ConnectionSettings } from './connectionSettings'
import { Errors } from './errorHelper'
import { getCopilotStudioConnectionUrl } from './powerPlatformEnvironment'
import { UserAgentHelper } from './userAgentHelper'

export type ConversationOperation = 'createConversation' | 'executeTurn' | 'subscribe'

export function getConversationEndpointsDiscoveryUrl (settings: ConnectionSettings): string {
  const url = new URL(getCopilotStudioConnectionUrl(settings))
  const schemaName = settings.schemaName?.trim() || settings.agentIdentifier?.trim()
  url.pathname = `/copilotstudio/agents/${encodeURIComponent(schemaName!)}/conversation-endpoints`
  url.search = ''
  return url.href
}

function validateOperationUrl (value: unknown, discoveryUrl: URL, requiresConversationId: boolean): string {
  const suffixIndex = discoveryUrl.hostname.indexOf('.environment.')
  const suffix = suffixIndex >= 0 ? discoveryUrl.hostname.slice(suffixIndex) : `.${discoveryUrl.hostname}`
  if (typeof value === 'string' && value.trim() &&
      requiresConversationId === value.includes('{conversationId}') &&
      !/[{}]/.test(value.replaceAll('{conversationId}', '')) &&
      /^https:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value.replaceAll('{conversationId}', 'conversation'))
    } catch (error) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidDiscoveryOperationUrl, error instanceof Error ? error : undefined)
    }
    if (url.protocol === 'https:' && url.port === discoveryUrl.port &&
        url.hostname.endsWith(suffix) && !url.username && !url.password && !url.hash) {
      return value
    }
  }
  throw ExceptionHelper.generateException(Error, Errors.InvalidDiscoveryOperationUrl)
}

export class ConversationEndpoints {
  readonly createConversation: string
  private readonly executeTurn: string
  private readonly subscribe?: string

  constructor (data: unknown, discoveryUrl: URL) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidDiscoveryResponse)
    }
    this.createConversation = validateOperationUrl('createConversation' in data ? data.createConversation : undefined, discoveryUrl, false)
    this.executeTurn = validateOperationUrl('executeTurn' in data ? data.executeTurn : undefined, discoveryUrl, true)
    validateOperationUrl('continueTurn' in data ? data.continueTurn : undefined, discoveryUrl, true)
    if ('subscribe' in data && data.subscribe != null) {
      this.subscribe = validateOperationUrl(data.subscribe, discoveryUrl, true)
    }
  }

  getUrl (operation: ConversationOperation, conversationId?: string): string {
    if (operation === 'createConversation') {
      return this.createConversation
    }
    if (!conversationId) {
      throw ExceptionHelper.generateException(Error, Errors.DiscoveryConversationIdRequired)
    }
    const url = operation === 'executeTurn' ? this.executeTurn : this.subscribe
    if (!url) {
      throw ExceptionHelper.generateException(Error, Errors.DiscoverySubscribeNotSupported)
    }
    return url.replaceAll('{conversationId}', encodeURIComponent(conversationId))
  }
}

export async function discoverConversationEndpoints (
  discoveryUrl: string,
  send: (url: string, init: RequestInit) => Promise<Response>,
  token: string
): Promise<ConversationEndpoints> {
  if (!token.trim()) {
    throw ExceptionHelper.generateException(Error, Errors.DiscoveryAccessTokenRequired)
  }
  const response = await send(discoveryUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': UserAgentHelper.getProductInfo()
    },
    redirect: 'error'
  })
  let data: unknown
  try {
    data = await response.json()
  } catch (error) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidDiscoveryResponse, error instanceof Error ? error : undefined)
  }
  return new ConversationEndpoints(data, new URL(discoveryUrl))
}
