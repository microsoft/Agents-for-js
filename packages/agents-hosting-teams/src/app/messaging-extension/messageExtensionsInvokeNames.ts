/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Enum representing the names of various invoke activities for messaging extensions in a Teams application.
 */
export enum MessageExtensionsInvokeNames {
  /**
   * Represents the invoke name for an anonymous query link.
   */
  ANONYMOUS_QUERY_LINK_INVOKE = 'composeExtension/anonymousQueryLink',

  /**
   * Represents the invoke name for fetching a task module.
   */
  FETCH_TASK_INVOKE = 'composeExtension/fetchTask',

  /**
   * Represents the invoke name for querying a messaging extension.
   */
  QUERY_INVOKE = 'composeExtension/query',

  /**
   * Represents the invoke name for querying a link in a messaging extension.
   */
  QUERY_LINK_INVOKE = 'composeExtension/queryLink',

  /**
   * Represents the invoke name for selecting an item in a messaging extension.
   */
  SELECT_ITEM_INVOKE = 'composeExtension/selectItem',

  /**
   * Represents the invoke name for submitting an action in a messaging extension.
   */
  SUBMIT_ACTION_INVOKE = 'composeExtension/submitAction',

  /**
   * Represents the invoke name for querying a URL setting in a messaging extension.
   */
  QUERY_SETTING_URL = 'composeExtension/querySettingUrl',

  /**
   * Represents the invoke name for configuring settings in a messaging extension.
   */
  CONFIGURE_SETTINGS = 'composeExtension/setting',

  /**
   * Represents the invoke name for handling button clicks in a messaging extension card.
   */
  QUERY_CARD_BUTTON_CLICKED = 'composeExtension/onCardButtonClicked'
}
