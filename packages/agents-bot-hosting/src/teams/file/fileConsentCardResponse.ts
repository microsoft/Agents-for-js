/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { FileUploadInfo } from './fileUploadInfo'

export type Action = 'accept' | 'decline'

export interface FileConsentCardResponse {
  action?: Action
  context?: any
  uploadInfo?: FileUploadInfo
}
