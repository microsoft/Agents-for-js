import { Activity } from '@microsoft/agents-activity-schema'
import { TranscriptLogger } from './transcriptLogger'

export class ConsoleTranscriptLogger implements TranscriptLogger {
  logActivity (activity: Activity): void | Promise<void> {
    if (!activity) {
      throw new Error('Activity is required.')
    }

    console.log('Activity Log:', activity)
  }
}
