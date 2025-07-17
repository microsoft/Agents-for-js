/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the surface of a meeting stage.
 * @typeParam T - The type of the content.
 */
export interface MeetingStageSurface<T> {
  /** The surface type, which is always 'meetingStage'. */
  surface: 'meetingStage';
  /** The content type, which is always 'task'. */
  contentType: 'task';
  /** The content of the meeting stage. */
  content: T;
}
