// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  CloudAdapter,
  TurnContext,
  ConnectorClient,
  TokenExchangeRequest,
  UserTokenClient,
  SigningResource
} from '@microsoft/agents-hosting'
import { OAuthPromptSettings } from './oauthPrompt'

/**
 * @internal
 */
export async function getUserToken (
  context: TurnContext,
  settings: OAuthPromptSettings,
  magicCode: string
) {
  const authConfig = context.adapter.authConfig
  if (authConfig.connectionName === undefined) {
    throw new Error('connectionName is not set in the auth config, review your environment variables')
  }
  const adapter = context.adapter as CloudAdapter
  const scope = 'https://api.botframework.com'
  const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
  const userTokenClient = new UserTokenClient(accessToken)

  if (userTokenClient) {
    return userTokenClient.getUserToken(
      context.activity?.from?.id,
      settings.connectionName,
      context.activity?.channelId,
      magicCode
    )
  } else {
    throw new Error('OAuth prompt is not supported by the current adapter')
  }
}

/**
 * @internal
 */
export async function getSignInResource (
  context: TurnContext,
  settings: OAuthPromptSettings
): Promise<SigningResource> {
  const authConfig = context.adapter.authConfig
  if (authConfig.connectionName === undefined) {
    throw new Error('connectionName is not set in the auth config, review your environment variables')
  }
  const adapter = context.adapter as CloudAdapter
  const scope = 'https://api.botframework.com'
  const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
  const userTokenClient = new UserTokenClient(accessToken)

  if (userTokenClient) {
    return userTokenClient.getSignInResource(context.adapter.authConfig.clientId, settings.connectionName, context.activity)
  } else {
    throw new Error('OAuth prompt is not supported by the current adapter')
  }
}

/**
 * @internal
 */
export async function signOutUser (context: TurnContext, settings: OAuthPromptSettings): Promise<void> {
  const authConfig = context.adapter.authConfig
  if (authConfig.connectionName === undefined) {
    throw new Error('connectionName is not set in the auth config, review your environment variables')
  }
  const adapter = context.adapter as CloudAdapter
  const scope = 'https://api.botframework.com'
  const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
  const userTokenClient = new UserTokenClient(accessToken)

  if (userTokenClient) {
    await userTokenClient.signOut(
      context.activity?.from?.id,
      settings.connectionName,
      context.activity?.channelId
    )
  } else {
    throw new Error('OAuth prompt is not supported by the current adapter')
  }
}

/**
 * @internal
 */
export async function exchangeToken (
  context: TurnContext,
  settings: OAuthPromptSettings,
  tokenExchangeRequest: TokenExchangeRequest
) {
  const authConfig = context.adapter.authConfig
  if (authConfig.connectionName === undefined) {
    throw new Error('connectionName is not set in the auth config, review your environment variables')
  }
  const adapter = context.adapter as CloudAdapter
  const scope = 'https://api.botframework.com'
  const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
  const userTokenClient = new UserTokenClient(accessToken)

  if (userTokenClient) {
    return userTokenClient.exchangeTokenAsync(
      context.activity?.from?.id,
      settings.connectionName,
      context.activity?.channelId,
      tokenExchangeRequest
    )
  } else {
    throw new Error('OAuth prompt is not supported by the current adapter')
  }
}

/**
 * @internal
 */
export async function createConnectorClient (
  context: TurnContext,
  serviceUrl: string,
  scope: string
): Promise<ConnectorClient> {
  return ConnectorClient.createClientWithAuthAsync(
    serviceUrl,
    context.adapter.authConfig,
    context.adapter.authProvider,
    scope
  )
}
