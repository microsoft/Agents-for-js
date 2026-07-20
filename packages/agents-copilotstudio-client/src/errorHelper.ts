// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

export const Errors: { [key: string]: AgentErrorDefinition } = {
  InvalidPowerPlatformCloud: {
    code: -140000,
    description: "Invalid PowerPlatformCloud: '{cloud}'. Supported values: {supportedValues}"
  },

  InvalidAgentType: {
    code: -140001,
    description: "Invalid AgentType: '{agentType}'. Supported values: {supportedValues}"
  },

  MissingConnectionUrlSettings: {
    code: -140010,
    description: 'Either directConnectUrl OR both environmentId and schemaName/agentIdentifier must be provided'
  },

  InvalidDirectConnectUrl: {
    code: -140011,
    description: 'directConnectUrl must be a valid URL'
  },

  CustomPowerPlatformCloudRequired: {
    code: -140012,
    description: 'customPowerPlatformCloud must be provided when PowerPlatformCloud is Other'
  },

  InvalidCustomPowerPlatformCloud: {
    code: -140013,
    description: 'customPowerPlatformCloud must be a valid URL'
  },

  SubscribeUrlConversationIdRequired: {
    code: -140014,
    description: 'conversationId is required for subscribe URL'
  },

  CloudBaseAddressRequiredForCategoryOther: {
    code: -140015,
    description: 'cloudBaseAddress must be provided when PowerPlatformCloudCategory is Other'
  },

  SettingsOrCloudRequired: {
    code: -140016,
    description: 'Either settings or cloud must be provided'
  },

  CustomCloudOrBaseAddressRequired: {
    code: -140017,
    description: 'Either CustomPowerPlatformCloud or cloudBaseAddress must be provided when PowerPlatformCloudCategory is Other'
  },

  UnableToResolveCloudFromDirectConnectUrl: {
    code: -140018,
    description: 'Unable to resolve the PowerPlatform Cloud from DirectConnectUrl. The Token Audience resolver requires a specific PowerPlatformCloudCategory.'
  },

  DirectConnectUrlRequiredWhenSet: {
    code: -140019,
    description: 'DirectConnectUrl must be provided when DirectConnectUrl is set'
  },

  CloudBaseAddressRequiredForCloudOther: {
    code: -140020,
    description: 'cloudBaseAddress must be provided when PowerPlatformCloud is Other'
  },

  InvalidClusterCategory: {
    code: -140021,
    description: 'Invalid cluster category value: {category}'
  },

  ExecuteStreamingConversationIdRequired: {
    code: -140030,
    description: 'conversationId is required for executeStreaming'
  },

  SubscribeAsyncConversationIdRequired: {
    code: -140031,
    description: 'conversationId is required for subscribeAsync'
  },

  ActivityCannotBeNull: {
    code: -140040,
    description: 'Activity cannot be null.'
  },

  ConnectionAlreadyEnded: {
    code: -140041,
    description: 'Connection has been ended.'
  },

  ActivitySubscriberNotInitialized: {
    code: -140042,
    description: 'Activity subscriber is not initialized.'
  },

  FailedToFetchBlobUrl: {
    code: -140043,
    description: 'Failed to fetch blob URL: {status} {statusText}'
  }
}
