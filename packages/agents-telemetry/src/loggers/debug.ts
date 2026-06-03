/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import createDebug from 'debug'
import { isBrowser } from '../utils/platform.js'
import { levels } from './base.js'
import type { LoggerLevel, Logger as BaseLogger } from './base.js'

type Logger = Record<LoggerLevel, createDebug.Debugger>

/**
 * Creates a debug logger with the specified namespace and log levels. The logger will use different colors for each log level and will work in both Node.js and browser environments.
 */
export function createDebugLogger (namespace: string): Logger {
  return {
    info: createLogger(namespace, 'info'),
    warn: createLogger(namespace, 'warn'),
    error: createLogger(namespace, 'error'),
    debug: createLogger(namespace, 'debug'),
  }
}

const colors = {
  node: {
    info: '2', // Green
    warn: '3', // Yellow
    error: '1', // Red
    debug: '4', // Blue
  },
  browser: {
    info: '#33CC99', // Green
    warn: '#CCCC33', // Yellow
    error: '#CC3366', // Red
    debug: '#0066FF', // Blue
  },

}

function createLogger (namespace: string, level: LoggerLevel): createDebug.Debugger {
  const logger = createDebug(`${namespace}:${level}`)

  if (isBrowser) {
    logger.color = colors.browser[level]
  } else {
    logger.color = colors.node[level]
  }

  return logger
}

/**
 * Links the debug logger with additional logger implementations.
 *
 * @remarks
 * - Linked loggers only receive messages when the corresponding debug namespace is enabled.
 */
export function link (debugLogger: Logger, ...loggers: BaseLogger[]): BaseLogger {
  return levels.reduce((acc, level) => {
    acc[level] = (message: string, ...args: any[]) => {
      if (!debugLogger[level].enabled) {
        return
      }
      debugLogger[level](message, ...args)
      for (const logger of loggers) {
        logger[level](message, ...args)
      }
    }
    return acc
  }, {} as BaseLogger)
}
