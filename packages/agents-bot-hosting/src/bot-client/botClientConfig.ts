export interface BotClientConfig {
  botEndPoint: string,
  botId: string,
  serviceUrl: string
}

export const loadBotClientConfig = (botName: string): BotClientConfig => {
  if (botName) {
    if (process.env[`${botName}_endpoint`] !== undefined &&
        process.env[`${botName}_clientId`] !== undefined &&
        process.env[`${botName}_serviceUrl`] !== undefined) {
      return {
        botEndPoint: process.env[`${botName}_endpoint`]!,
        botId: process.env[`${botName}_clientId`]!,
        serviceUrl: process.env[`${botName}_serviceUrl`]!
      }
    } else {
      throw new Error(`Missing bot client config for bot ${botName}`)
    }
  } else {
    throw new Error('Bot name is required')
  }
}
