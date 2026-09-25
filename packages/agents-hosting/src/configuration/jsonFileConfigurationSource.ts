/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { readFile } from 'node:fs/promises'
import { Errors } from '../errorHelper'
import { ConfigurationDocument, ConfigurationSource } from './configurationSource'

const safeErrors = new WeakSet<Error>()

/**
 * Creates a configuration source that loads a hierarchical Agents SDK
 * configuration document from a JSON file.
 *
 * @param filePath Path to the JSON configuration file.
 * @returns A configuration source for use with `createConfigurationContext`
 * or `preloadConfigurationSources`.
 */
export function createJsonFileConfigurationSource (filePath: string): ConfigurationSource {
  return {
    name: filePath,
    async load () {
      let contents: string
      try {
        contents = await readFile(filePath, 'utf8')
      } catch {
        const error = ExceptionHelper.generateException(
          Error,
          Errors.JsonConfigurationFileReadFailed,
          undefined,
          { filePath }
        )
        safeErrors.add(error)
        throw error
      }

      let value: unknown
      try {
        value = JSON.parse(contents)
      } catch {
        const error = ExceptionHelper.generateException(
          SyntaxError,
          Errors.InvalidJsonConfigurationFile,
          undefined,
          { filePath }
        )
        safeErrors.add(error)
        throw error
      }

      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        const error = ExceptionHelper.generateException(
          TypeError,
          Errors.JsonConfigurationDocumentRequired,
          undefined,
          { filePath }
        )
        safeErrors.add(error)
        throw error
      }

      return {
        format: 'document',
        value: value as ConfigurationDocument
      }
    }
  }
}

export function isSafeJsonFileConfigurationError (error: unknown): error is Error {
  return error instanceof Error && safeErrors.has(error)
}
