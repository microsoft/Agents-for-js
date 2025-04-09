import { AttachmentData, AttachmentInfo, BaseAdapter, ResourceResponse, TurnContext, TurnState } from '../../src'
import { Activity, ConversationReference } from '@microsoft/agents-activity'

export class TestAdapter extends BaseAdapter {
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    const responses: ResourceResponse[] = []
    for (const activity of activities) {
      if (activity.type === 'delay') {
        const delayMs = parseInt(activity.value as string, 10)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      responses.push({ id: activity.id } as ResourceResponse)
    }
    return responses
  }

  updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    throw new Error('Method not implemented.')
  }

  deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  continueConversation (reference: Partial<ConversationReference>, logic: (revocableContext: TurnContext) => Promise<void>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }
}

export const createTestTurnContextAndState = async (adapter: TestAdapter, activity: Partial<Activity>): Promise<[TurnContext, TurnState]> => {
  const context = new TurnContext(adapter, activity as Activity)
  const state = new TurnState()
  await state.load(context)
  return [context, state]
}
