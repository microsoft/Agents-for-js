// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

export const Errors: { [key: string]: AgentErrorDefinition } = {
  TraceDefinitionRequired: {
    code: -190000,
    description: 'Trace definition is required'
  },

  UnrecognizedSpanName: {
    code: -190001,
    description: 'Unrecognized span name "{spanName}". See SpanNames constants.'
  }
}
