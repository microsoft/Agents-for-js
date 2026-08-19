import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import { TranscriptLogger } from './transcriptLogger'
import { Errors } from '../errorHelper'

/**
 * A transcript logger that logs activities to the console.
 */
export class ConsoleTranscriptLogger implements TranscriptLogger {
  /**
   * Logs an activity to the console.
   * @param activity The activity to log.
   * @throws Will throw an error if the activity is not provided.
   */
  logActivity (activity: Activity): void | Promise<void> {
    if (!activity) {
      throw ExceptionHelper.generateException(Error, Errors.ActivityRequired)
    }

    console.log('Activity Log:', activity)
  }
}
