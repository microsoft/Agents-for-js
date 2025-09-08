/**
 * Data returned when feedback has been enabled and a messages thumbs-up or thumbs-down button
 * is clicked.
 */
export interface FeedbackLoopData {
  /**
   * The name of the action, which is always 'feedback' for feedback loop data.
   */
  actionName: 'feedback';

  /**
   * The value of the action, which contains the reaction and feedback provided by the user.
   */
  actionValue: {
    /**
     * 'like' or 'dislike'
     */
    reaction: 'like' | 'dislike';

    /**
     * The response the user provides when prompted with "What did you like/dislike?" after pressing
     * one of the feedback buttons.
     */
    feedback: string | Record<string, any>;
  };

  /**
     * The activity ID that the feedback was provided on.
     */
  replyToId: string;
}
