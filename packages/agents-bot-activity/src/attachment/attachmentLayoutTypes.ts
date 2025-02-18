/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum AttachmentLayoutTypes {
  List = 'list',
  Carousel = 'carousel',
}

export const attachmentLayoutTypesZodSchema = z.enum(['list', 'carousel'])
