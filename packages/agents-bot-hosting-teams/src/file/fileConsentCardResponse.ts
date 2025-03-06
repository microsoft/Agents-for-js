/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { FileUploadInfo } from './fileUploadInfo'

/**
 * Type representing possible actions for file consent.
 */
export type Action = 'accept' | 'decline'

/**
 * Interface representing the response to a file consent card.
 */
export interface FileConsentCardResponse {
  /**
   * The action taken by the user, either 'accept' or 'decline'.
   */
  action?: Action;

  /**
   * Additional context information.
   */
  context?: any;

  /**
   * Information about the file to be uploaded.
   */
  uploadInfo?: FileUploadInfo;
}
