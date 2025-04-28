import createDebug, { Debugger } from 'debug'

/**
 * Logger class that provides colored logging functionality using the debug package.
 * Supports different log levels: info, warn, error, and debug.
 */
export class Logger {
  private loggers: { [level: string]: Debugger } = {}
  private readonly levelColors: { [level: string]: string } = {
    info: '2', // Green
    warn: '3', // Yellow
    error: '1', // Red
    debug: '4' // Blue
  }

  /**
   * Creates a new Logger instance with the specified namespace.
   * @param namespace The namespace to use for the logger
   */
  constructor (namespace: string = '') {
    this.initializeLoggers(namespace)
  }

  private initializeLoggers (namespace: string) {
    for (const level of Object.keys(this.levelColors)) {
      const logger = createDebug(`${namespace}:${level}`)
      logger.color = this.levelColors[level]
      this.loggers[level] = logger
    }
  }

  /**
   * Logs an informational message.
   * @param message The message to log
   * @param args Additional arguments to include in the log
   */
  info (message: string, ...args: any[]) {
    this.loggers.info(message, ...args)
  }

  /**
   * Logs a warning message.
   * @param message The message to log
   * @param args Additional arguments to include in the log
   */
  warn (message: string, ...args: any[]) {
    this.loggers.warn(message, ...args)
  }

  /**
   * Logs an error message.
   * @param message The message to log
   * @param args Additional arguments to include in the log
   */
  error (message: string, ...args: any[]) {
    this.loggers.error(message, ...args)
  }

  /**
   * Logs a debug message.
   * @param message The message to log
   * @param args Additional arguments to include in the log
   */
  debug (message: string, ...args: any[]) {
    this.loggers.debug(message, ...args)
  }
}

/**
 * Creates a new Logger instance with the specified namespace.
 * @param namespace The namespace to use for the logger
 * @returns A new Logger instance
 */
export function debug (namespace: string): Logger {
  return new Logger(namespace)
}
