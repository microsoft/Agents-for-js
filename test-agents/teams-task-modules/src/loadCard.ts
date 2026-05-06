import { TaskModuleRequest } from '@microsoft/teams.api'
import fs from 'fs'
import path from 'path'

export function loadCardJson (fileName: string, tokens?: Record<string, string>, skipTokens?: string[]): object {
  const filePath = path.join(__dirname, '../src/cards', fileName)
  let json = fs.readFileSync(filePath, 'utf-8')

  if (tokens) {
    for (const [key, value] of Object.entries(tokens)) {
      if (!skipTokens?.includes(key)) {
        json = json.replaceAll(`{{${key}}}`, value)
      }
    }
  }

  return JSON.parse(json)
}

export function loadCardFromRequest (request: TaskModuleRequest, fileName: string, dataKey = 'task'): object {
  return loadCardJson(fileName, request.data as Record<string, string>, [dataKey])
}
