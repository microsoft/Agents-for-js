import { Activity } from '@microsoft/agents-activity-schema'

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
