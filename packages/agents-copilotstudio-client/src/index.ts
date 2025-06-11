export * from './agentType'
export * from './connectionSettings'
export * from './copilotStudioClient'
export * from './directToEngineConnectionSettings'
export * from './executeTurnRequest'
export * from './powerPlatformCloud'
export * from './powerPlatformEnvironment'

// Define CopilotStudioClient on globalThis for browsers
import { CopilotStudioClient } from "./copilotStudioClient";
import { CopilotStudioWebChat } from "./copilotStudioWebChat";

// TODO: check if this could be done by injecting to esbuild
if (typeof window !== "undefined") {
  (globalThis as any).Agents = {
    CopilotStudioClient,
    CopilotStudioWebChat,
  };
}
