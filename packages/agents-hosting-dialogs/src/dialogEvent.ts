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

/**
 * Configuration options for dialog initialization and behavior.
 * This interface defines the settings that can be applied when creating or configuring a dialog instance.
 */
export interface DialogConfiguration {
  /**
   * Optional static identifier for the dialog.
   * When provided, this unique identifier can be used to reference and manage the dialog instance
   * throughout its lifecycle. If not specified, the dialog will operate without a persistent identifier.
   */
  id?: string;
}
