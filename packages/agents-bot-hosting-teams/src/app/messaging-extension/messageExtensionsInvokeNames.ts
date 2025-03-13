/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export enum MessageExtensionsInvokeNames {
  ANONYMOUS_QUERY_LINK_INVOKE = 'composeExtension/anonymousQueryLink',
  FETCH_TASK_INVOKE = 'composeExtension/fetchTask',
  QUERY_INVOKE = 'composeExtension/query',
  QUERY_LINK_INVOKE = 'composeExtension/queryLink',
  SELECT_ITEM_INVOKE = 'composeExtension/selectItem',
  SUBMIT_ACTION_INVOKE = 'composeExtension/submitAction',
  QUERY_SETTING_URL = 'composeExtension/querySettingUrl',
  CONFIGURE_SETTINGS = 'composeExtension/setting',
  QUERY_CARD_BUTTON_CLICKED = 'composeExtension/onCardButtonClicked'
}
