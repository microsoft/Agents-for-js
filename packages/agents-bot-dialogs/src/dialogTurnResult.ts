import { DialogTurnStatus } from './dialogTurnStatus'

/**
 * Represents the result of a dialog context's attempt to begin, continue,
 * or otherwise manipulate one or more dialogs.
 *
 * @template T Optional. The type that represents a result returned by the active dialog when it
 *      successfully completes.
 *
 * @remarks
 * This can be used to determine if a dialog completed and a result is available, or if the stack
 * was initially empty and a dialog should be started.
 *
 */
export interface DialogTurnResult<T = any> {
  /**
     * The state of the dialog stack after a dialog context's attempt.
     */
  status: DialogTurnStatus;

  /**
     * The result, if any, returned by the last dialog on the stack.
     *
     * @remarks
     * A result value is available only if
     * the stack is now empty,
     * the last dialog on the stack completed normally,
     * and the last dialog returned a result to the dialog context.
     */
  result?: T;

  /**
     * If true, a `DialogCommand` has ended its parent container and the parent should not perform
     * any further processing.
     */
  parentEnded?: boolean;
}
