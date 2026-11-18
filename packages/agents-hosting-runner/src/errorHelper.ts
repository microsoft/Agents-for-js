// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { type AgentErrorDefinition } from '@microsoft/agents-activity'

export const Errors = {
  InvalidArguments: {
    code: -200000,
    description: 'Invalid runner arguments: {detail}'
  },
  InvalidIdentity: {
    code: -200001,
    description: 'Runner configuration ServiceConnection {property} must contain a valid GUID.'
  },
  InvalidAdditionalIssuers: {
    code: -200002,
    description: 'AgentRunner:Authentication:AdditionalEntraIssuers must contain absolute HTTPS issuer URIs.'
  },
  ModuleLoadFailed: {
    code: -200003,
    description: 'Unable to load agent module: {filePath}'
  },
  InvalidAgentExport: {
    code: -200004,
    description: 'Agent module {filePath} must export a named agent with run(context) and adapter.process(). Export an AgentApplication instance without starting its server.'
  },
  SettingsReadFailed: {
    code: -200005,
    description: 'Unable to access runner settings: {filePath}'
  }
} satisfies Record<string, AgentErrorDefinition>
