/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OTelLogs } from '../types.js'
import type { Logger, LoggerLevel } from './base.js'

/**
 * Creates an OpenTelemetry logger that implements the Logger interface for the Agents SDK. The logger will emit logs with the appropriate severity level and namespace attributes.
 */
export function createOTelLogger (otelLogs: OTelLogs, namespace: string): Logger {
  return {
    info: createLogger(otelLogs, namespace, 'info'),
    warn: createLogger(otelLogs, namespace, 'warn'),
    error: createLogger(otelLogs, namespace, 'error'),
    debug: createLogger(otelLogs, namespace, 'debug'),
  }
}

function createLogger (otelLogs: OTelLogs, namespace: string, level: LoggerLevel) {
  const logger = otelLogs.logs.getLogger(namespace)
  const _level = level?.toLowerCase() ?? 'debug'
  const severityNumber = {
    debug: otelLogs.SeverityNumber.DEBUG,
    info: otelLogs.SeverityNumber.INFO,
    warn: otelLogs.SeverityNumber.WARN,
    error: otelLogs.SeverityNumber.ERROR,
  }[_level]

  return function log (message: string, ...args: any[]) {
    logger.emit({
      severityNumber,
      severityText: _level.toUpperCase(),
      body: formatMessage(message, args),
      attributes: {
        'log.namespace': namespace,
        'log.level': _level,
      },
    })
  }
}

/**
 * Formats the message body sent to the OTel log record.
 *
 * @remarks
 * - Extra arguments are serialized and appended to the main message.
 */
function formatMessage (message: string, args: unknown[]): string {
  if (args.length === 0) {
    return message
  }

  const serialized = args.map((value) => serializeLogValue(value)).join(' ')
  return `${message} ${serialized}`
}

/**
 * Converts log arguments to a string form that is safe to emit.
 */
function serializeLogValue (value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  if (value === null || value === undefined) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
