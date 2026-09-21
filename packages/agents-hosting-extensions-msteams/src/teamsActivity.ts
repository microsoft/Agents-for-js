// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Activity } from '@microsoft/agents-activity'
import type { ChannelData } from '@microsoft/teams.api'

/**
 * A Teams activity whose channel-specific payload uses the Microsoft Teams API model.
 *
 * @remarks
 * This is a type-only specialization of {@link Activity}. Teams activities keep
 * their original runtime identity; no activity conversion or cloning occurs.
 */
export interface TeamsActivity extends Activity {
  /**
   * Channel-specific data for the Teams activity.
   */
  channelData?: ChannelData
}
