/**
 * Represents an event that occurs within a dialog, providing details such as its name, whether it should bubble to parent contexts, and any associated value.
 */
export interface DialogEvent {
  /**
   * Flag indicating whether the event will be bubbled to the parent `DialogContext`.
   */
  bubble: boolean;

  /**
   * Name of the event being raised.
   */
  name: string;

  /**
   * Optional. Value associated with the event.
   */
  value?: any;
}

export interface DialogConfiguration {
  /**
   * Static id of the dialog.
   */
  id?: string;
}
