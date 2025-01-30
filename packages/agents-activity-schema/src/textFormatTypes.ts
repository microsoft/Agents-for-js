/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum TextFormatTypes {
  Markdown = 'markdown',
  Plain = 'plain',
  Xml = 'xml',
}

export const textFormatTypesZodSchema = z.enum(['markdown', 'plain', 'xml'])
