/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines path for available dialogs.
 */
export class DialogPath {
  /**
   * Counter of emitted events.
   * @returns A string key representing the event counter path (`'dialog.eventCounter'`).
   */
  static readonly eventCounter: string = 'dialog.eventCounter'

  /**
   * Currently expected properties.
   * @returns A string key representing the expected properties path (`'dialog.expectedProperties'`).
   */
  static readonly expectedProperties: string = 'dialog.expectedProperties'

  /**
   * Default operation to use for entities where there is no identified operation entity.
   * @returns A string key representing the default operation path (`'dialog.defaultOperation'`).
   */
  static readonly defaultOperation: string = 'dialog.defaultOperation'

  /**
   * Last surfaced entity ambiguity event.
   * @returns A string key representing the last event path (`'dialog.lastEvent'`).
   */
  static readonly lastEvent: string = 'dialog.lastEvent'

  /**
   * Currently required properties.
   * @returns A string key representing the required properties path (`'dialog.requiredProperties'`).
   */
  static readonly requiredProperties: string = 'dialog.requiredProperties'

  /**
   * Number of retries for the current Ask.
   * @returns A string key representing the retries path (`'dialog.retries'`).
   */
  static readonly retries: string = 'dialog.retries'

  /**
   * Last intent.
   * @returns A string key representing the last intent path (`'dialog.lastIntent'`).
   */
  static readonly lastIntent: string = 'dialog.lastIntent'

  /**
   * Last trigger event: defined in FormEvent, ask, clarifyEntity etc.
   * @returns A string key representing the last trigger event path (`'dialog.lastTriggerEvent'`).
   */
  static readonly lastTriggerEvent: string = 'dialog.lastTriggerEvent'
}
