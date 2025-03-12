/**
 * Indicates why a dialog method is being called.
 *
 * @remarks
 * Use a dialog context to control the dialogs in a dialog set. The dialog context will pass a reference to itself
 * to the dialog method it calls. It also passes in the _reason_ why the specific method is being called.
 *
 */
export enum DialogReason {
  /**
       * The dialog is being started from DialogContext.beginDialog or DialogContext.replaceDialog.
       */
  beginCalled = 'beginCalled',

  /**
       * The dialog is being continued from DialogContext.continueDialog.
       */
  continueCalled = 'continueCalled',

  /**
       * The dialog is being ended from DialogContext.endDialog.
       */
  endCalled = 'endCalled',

  /**
       * The dialog is being ended from DialogContext.replaceDialog.
       */
  replaceCalled = 'replaceCalled',

  /**
       * The dialog is being cancelled from DialogContext.cancelAllDialogs.
       */
  cancelCalled = 'cancelCalled',

  /**
       * A step in a WaterfallDialog is being called
       * because the previous step in the waterfall dialog called WaterfallStepContext.next.
       */
  nextCalled = 'nextCalled',
}
