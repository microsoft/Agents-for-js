/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing a meeting tab icon surface.
 */
export interface MeetingTabIconSurface {
  /**
   * The type of surface.
   */
  surface: 'meetingTabIcon';

  /**
   * The tab entity ID associated with the surface.
   */
  tabEntityId?: string;
}
