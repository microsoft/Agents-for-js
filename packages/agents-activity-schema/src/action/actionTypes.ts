/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum ActionTypes {
  OpenUrl = 'openUrl',
  ImBack = 'imBack',
  PostBack = 'postBack',
  PlayAudio = 'playAudio',
  PlayVideo = 'playVideo',
  ShowImage = 'showImage',
  DownloadFile = 'downloadFile',
  Signin = 'signin',
  Call = 'call',
  MessageBack = 'messageBack',
  OpenApp = 'openApp',
}

export const actionTypesZodSchema = z.enum(['openUrl', 'imBack', 'postBack', 'playAudio', 'showImage', 'downloadFile', 'signin', 'call', 'messageBack', 'openApp'])
