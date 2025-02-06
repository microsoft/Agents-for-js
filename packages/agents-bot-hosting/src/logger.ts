import createDebug, { Debugger } from 'debug'

class Logger {
  private loggers: { [level: string]: Debugger } = {}
  private readonly levelColors: { [level: string]: string } = {
    info: '2', // Green
    warn: '3', // Yellow
    error: '1' // Red
  }

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

  info (message: string, ...args: any[]) {
    this.loggers.info(message, ...args)
  }

  warn (message: string, ...args: any[]) {
    this.loggers.warn(message, ...args)
  }

  error (message: string, ...args: any[]) {
    this.loggers.error(message, ...args)
  }
}

export function debug (namespace: string): Logger {
  return new Logger(namespace)
}
