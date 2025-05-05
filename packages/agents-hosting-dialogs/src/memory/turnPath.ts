/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines path for available turns.
 */
export class TurnPath {
  /**
   * The result from the last dialog that was called.
   * @constant A string key representing the last result path (`'turn.lastresult'`).
   */
  static readonly lastResult: string = 'turn.lastresult'

  /**
   * The current activity for the turn.
   * @constant A string key representing the activity path (`'turn.activity'`).
   */
  static readonly activity: string = 'turn.activity'

  /**
   * The recognized result for the current turn.
   * @constant A string key representing the recognized result path (`'turn.recognized'`).
   */
  static readonly recognized: string = 'turn.recognized'

  /**
   * Path to the top intent.
   * @constant A string key representing the top intent path (`'turn.recognized.intent'`).
   */
  static readonly topIntent: string = 'turn.recognized.intent'

  /**
   * Path to the top score.
   * @constant A string key representing the top score path (`'turn.recognized.score'`).
   */
  static readonly topScore: string = 'turn.recognized.score'

  /**
   * Original text.
   * @constant A string key representing the original text path (`'turn.recognized.text'`).
   */
  static readonly text: string = 'turn.recognized.text'

  /**
   * Original utterance split into unrecognized strings.
   * @constant A string key representing the unrecognized text path (`'turn.unrecognizedText'`).
   */
  static readonly unrecognizedText: string = 'turn.unrecognizedText'

  /**
   * Entities that were recognized from text.
   * @constant A string key representing the recognized entities path (`'turn.recognizedEntities'`).
   */
  static readonly recognizedEntities: string = 'turn.recognizedEntities'

  /**
   * If true, an interruption has occurred.
   * @constant A string key representing the interrupted path (`'turn.interrupted'`).
   */
  static readonly interrupted: string = 'turn.interrupted'

  /**
   * The current dialog event (set during event processing).
   * @constant A string key representing the dialog event path (`'turn.dialogEvent'`).
   */
  static readonly dialogEvent: string = 'turn.dialogEvent'

  /**
   * Used to track that we don't end up in an infinite loop of RepeatDialogs().
   * @constant A string key representing the repeated IDs path (`'turn.repeatedIds'`).
   */
  static readonly repeatedIds: string = 'turn.repeatedIds'

  /**
   * Indicates whether the turncontext.activity has been consumed by some component in the system.
   * @constant A string key representing the activity processed path (`'turn.activityProcessed'`).
   */
  static readonly activityProcessed: string = 'turn.activityProcessed'
}
