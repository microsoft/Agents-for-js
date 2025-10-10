/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing information required for file upload.
 */
export interface FileUploadInfo {
  /**
   * The name of the file.
   */
  name?: string;

  /**
   * The URL to upload the file.
   */
  uploadUrl?: string;

  /**
   * The URL to access the uploaded file.
   */
  contentUrl?: string;

  /**
   * A unique identifier for the file.
   */
  uniqueId?: string;

  /**
   * The type of the file.
   */
  fileType?: string;
}
