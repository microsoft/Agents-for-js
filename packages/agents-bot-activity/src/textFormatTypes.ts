/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing text format types.
 */
export enum TextFormatTypes {
  Markdown = 'markdown',
  Plain = 'plain',
  Xml = 'xml',
}

/**
 * Zod schema for validating TextFormatTypes enum values.
 */
export const textFormatTypesZodSchema = z.enum(['markdown', 'plain', 'xml'])
