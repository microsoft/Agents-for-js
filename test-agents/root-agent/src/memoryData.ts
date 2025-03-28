import { ConversationReference } from '@microsoft/agents-hosting'

export interface ConversationData {
  nameRequested: boolean
  conversationReference: ConversationReference
}

export interface UserProfile {
  name?: string
}
