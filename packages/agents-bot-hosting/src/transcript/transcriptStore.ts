import { Activity } from '@microsoft/agents-activity-schema'
import { PagedResult, TranscriptInfo, TranscriptLogger } from './transcriptLogger'

export interface TranscriptStore extends TranscriptLogger {
  getTranscriptActivities(
    channelId: string,
    conversationId: string,
    continuationToken?: string,
    startDate?: Date,
  ): Promise<PagedResult<Activity>>;

  listTranscripts(channelId: string, continuationToken?: string): Promise<PagedResult<TranscriptInfo>>;

  deleteTranscript(channelId: string, conversationId: string): Promise<void>;
}
