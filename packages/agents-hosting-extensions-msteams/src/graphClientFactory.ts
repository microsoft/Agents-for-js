// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { type AuthProvider, type Authorization, type TurnContext } from '@microsoft/agents-hosting'
import { Client as GraphClient, type AuthenticationProvider, type ClientOptions } from '@microsoft/microsoft-graph-client'
import { Errors } from './errorHelper'

const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

class UserTokenProvider implements AuthenticationProvider {
  constructor (
    private readonly authorization: Authorization,
    private readonly context: TurnContext,
    private readonly handlerName?: string
  ) {}

  async getAccessToken (): Promise<string> {
    const handlerName = this.handlerName ?? this.getDefaultHandlerName()
    const { token } = await this.authorization.getToken(this.context, handlerName)

    if (!token?.trim()) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphTokenUnavailable, undefined, { handlerName })
    }

    return token
  }

  private getDefaultHandlerName (): string {
    const authorization = this.authorization as unknown as {
      manager?: { handlers?: Array<{ id: string }> }
    }
    const handlerIds = authorization.manager?.handlers?.map((handler) => handler.id) ?? []

    if (handlerIds.length === 1) {
      return handlerIds[0]
    }

    if (handlerIds.length === 0) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphAuthorizationHandlerRequired)
    }

    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphAuthorizationHandlerNameRequired)
  }
}

class AppTokenProvider implements AuthenticationProvider {
  constructor (
    private readonly tokenProvider: AuthProvider,
    private readonly scope: string
  ) {}

  async getAccessToken (): Promise<string> {
    return await this.tokenProvider.getAccessToken(this.scope)
  }
}

/**
 * Creates a Microsoft Graph client authenticated with a delegated user token.
 */
export function createUserGraphClient (
  authorization: Authorization,
  context: TurnContext,
  handlerName?: string,
  graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL
): GraphClient {
  if (!authorization) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'authorization' })
  }
  if (!context) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'context' })
  }
  if (!graphBaseUrl) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'graphBaseUrl' })
  }

  let graphUrl: URL
  try {
    graphUrl = new URL(graphBaseUrl)
  } catch {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphInvalidBaseUrl)
  }

  return GraphClient.initWithMiddleware(createGraphClientOptions(
    new UserTokenProvider(authorization, context, handlerName),
    graphBaseUrl,
    graphUrl
  ))
}

/**
 * Creates a Microsoft Graph client authenticated with an app-only token.
 */
export function createAppGraphClient (
  tokenProvider: AuthProvider,
  graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL
): GraphClient {
  if (!tokenProvider) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'tokenProvider' })
  }
  if (!graphBaseUrl) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'graphBaseUrl' })
  }

  let graphUrl: URL
  try {
    graphUrl = new URL(graphBaseUrl)
  } catch {
    throw ExceptionHelper.generateException(Error, Errors.TeamsGraphInvalidBaseUrl)
  }
  const scope = `${graphUrl.origin}/.default`

  return GraphClient.initWithMiddleware(createGraphClientOptions(
    new AppTokenProvider(tokenProvider, scope),
    graphBaseUrl,
    graphUrl
  ))
}

function createGraphClientOptions (authProvider: AuthenticationProvider, graphBaseUrl: string, graphUrl: URL): ClientOptions {
  return {
    authProvider,
    baseUrl: graphBaseUrl,
    defaultVersion: '',
    customHosts: new Set([graphUrl.hostname])
  }
}
