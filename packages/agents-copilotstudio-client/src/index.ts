import { CopilotStudioClient } from './copilotStudioClient'
import { CopilotStudioWebChat } from './copilotStudioWebChat'

export * from './agentType'
export * from './connectionSettings'
export * from './copilotStudioClient'
export * from './directToEngineConnectionSettings'
export * from './executeTurnRequest'
export * from './powerPlatformCloud'
export * from './powerPlatformEnvironment'

// Define CopilotStudioClient on globalThis for browsers
if (typeof window !== 'undefined') {
  (globalThis as any).Agents = {
    CopilotStudioClient,
    CopilotStudioWebChat,
  }
}
