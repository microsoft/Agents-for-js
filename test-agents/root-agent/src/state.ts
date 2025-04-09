import { ConversationReference } from '@microsoft/agents-activity'

export interface ConversationData {
  nameRequested: boolean
  conversationReference: ConversationReference
}

export interface UserProfile {
  name?: string
}
