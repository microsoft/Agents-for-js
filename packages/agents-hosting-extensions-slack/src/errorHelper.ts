// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the Slack Extensions system.
 * Error codes start at -160000.
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  SlackApiError: {
    code: -160000,
    description: 'Slack API call failed: {error}',
  },
  SlackApiHttpError: {
    code: -160001,
    description: 'Slack API HTTP request failed with status {status}',
  },
  SlackApiTokenMissing: {
    code: -160002,
    description: 'No Slack API token available. Set ApiToken in channel data or SLACK_TOKEN environment variable.',
  },
  SlackStreamNotStarted: {
    code: -160003,
    description: 'SlackStream.start() must be called before append() or stop().',
  },
}
