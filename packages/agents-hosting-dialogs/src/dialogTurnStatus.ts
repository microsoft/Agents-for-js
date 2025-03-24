/**
 * Represents the state of the dialog stack after a dialog context attempts to begin, continue,
 * or otherwise manipulate one or more dialogs.
 *
 */
export enum DialogTurnStatus {
  /**
     * The dialog stack is empty.
     *
     * @remarks
     * Indicates that the dialog stack was initially empty when the operation was attempted.
     */
  empty = 'empty',

  /**
     * The active dialog on top of the stack is waiting for a response from the user.
     */
  waiting = 'waiting',

  /**
     * The last dialog on the stack completed successfully.
     *
     * @remarks
     * Indicates that a result might be available and the stack is now empty.
     *
     */
  complete = 'complete',

  /**
     * All dialogs on the stack were cancelled and the stack is empty.
     */
  cancelled = 'cancelled',

  /**
     * Current dialog completed successfully, but turn should end.
     */
  completeAndWait = 'completeAndWait',
}
