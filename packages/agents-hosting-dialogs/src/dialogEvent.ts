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
