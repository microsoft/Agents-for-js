/**
 * Contains state information for an instance of a dialog on the stack.
 *
 * @template T Optional. The type that represents state information for the dialog.
 *
 * @remarks
 * This contains information for a specific instance of a dialog on a dialog stack.
 * The dialog stack is associated with a specific dialog context and dialog set.
 * Information about the dialog stack as a whole is persisted to storage using a dialog state object.
 *
 */
export interface DialogInstance<T = any> {
  /**
       * ID of this dialog
       *
       * @remarks
       * Dialog state is associated with a specific dialog set.
       * This ID is the the dialog's Dialog.id within that dialog set.
       *
       */
  id: string;

  /**
       * The state information for this instance of this dialog.
       */
  state: T;

  /**
       * Hash code used to detect that a dialog has changed since the curent instance was started.
       */
  version?: string;
}
