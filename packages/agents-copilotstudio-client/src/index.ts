import { CopilotStudioClient } from './copilotStudioClient'
import { CopilotStudioWebChat } from './copilotStudioWebChat'

export * from './agentType'
export * from './connectionSettings'
export * from './copilotStudioClient'
export * from './copilotStudioConnectionSettings'
export * from './copilotStudioWebChat'
export * from './executeTurnRequest'
export * from './powerPlatformCloud'
export * from './powerPlatformEnvironment'

// Define CopilotStudioClient on window object for browsers
declare global {
  interface Window {
    Agents?: {
      CopilotStudioClient: typeof CopilotStudioClient;
      CopilotStudioWebChat: typeof CopilotStudioWebChat;
    };
  }
}

if (typeof window !== 'undefined') {
  window.Agents = {
    ...(window.Agents ?? {}),
    CopilotStudioClient,
    CopilotStudioWebChat,
  }
}
