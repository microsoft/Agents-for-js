/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CloudAdapter } from '../cloudAdapter'
import { InputFileDownloader } from './inputFileDownloader'
import { TurnState } from './turnState'
import { Storage } from '..'

export interface ApplicationOptions<TState extends TurnState> {
  adapter?: CloudAdapter;
  botAppId?: string;
  storage?: Storage;
  startTypingTimer: boolean;

  /**
     * Optional. If true, the bot supports long running messages that can take longer then the 10 - 15
     * second timeout imposed by most channels. Defaults to false.
     * @remarks
     * This works by immediately converting the incoming request to a proactive conversation. Care should
     * be used for bots that operate in a shared hosting environment. The incoming request is immediately
     * completed and many shared hosting environments will mark the bot's process as idle and shut it down.
     */
  longRunningMessages: boolean;
  turnStateFactory: () => TState;
  fileDownloaders?: InputFileDownloader<TState>[];
}
