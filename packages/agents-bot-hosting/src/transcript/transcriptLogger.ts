import { Activity } from '@microsoft/agents-bot-activity'

export interface TranscriptLogger {
  logActivity(activity: Activity): void | Promise<void>;
}

export interface TranscriptInfo {
  channelId: string;
  id: string;
  created: Date;
}

export interface PagedResult<T> {
  items: T[];
  continuationToken?: string;
}
