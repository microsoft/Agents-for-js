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
   */
  static readonly eventCounter: string = 'dialog.eventCounter'
  /**
   * Currently expected properties.
   */
  static readonly expectedProperties: string = 'dialog.expectedProperties'
  /**
   * Default operation to use for entities where there is no identified operation entity.
   */
  static readonly defaultOperation: string = 'dialog.defaultOperation'

  /**
   * Last surfaced entity ambiguity event.
   */
  static readonly lastEvent: string = 'dialog.lastEvent'

  /**
   * Currently required properties.
   */
  static readonly requiredProperties: string = 'dialog.requiredProperties'

  /**
   * Number of retries for the current Ask.
   */
  static readonly retries: string = 'dialog.retries'

  /**
   * Last intent.
   */
  static readonly lastIntent: string = 'dialog.lastIntent'

  /**
   * Last trigger event: defined in FormEvent, ask, clarifyEntity etc.
   */
  static readonly lastTriggerEvent: string = 'dialog.lastTriggerEvent'
}
