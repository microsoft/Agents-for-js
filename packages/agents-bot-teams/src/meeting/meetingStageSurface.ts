/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export interface MeetingStageSurface<T> {
  surface: 'meetingStage';
  contentType: 'task';
  content: T;
}
