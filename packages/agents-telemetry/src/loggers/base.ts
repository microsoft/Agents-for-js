/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Logger interface used by the Agents SDK telemetry surface.
 */
export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

/**
 * Supported logger method names.
 */
export type LoggerLevel = keyof Logger

/**
 * Ordered list of logger levels used when composing logger implementations.
 */
export const levels: LoggerLevel[] = ['info', 'warn', 'error', 'debug'] as const
