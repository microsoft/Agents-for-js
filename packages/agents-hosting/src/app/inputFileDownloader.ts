/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { TurnState } from './turnState'

export interface InputFile {
  content: Buffer;
  contentType: string;
  contentUrl?: string;
}

export interface InputFileDownloader<TState extends TurnState = TurnState> {
  downloadFiles(context: TurnContext, state: TState): Promise<InputFile[]>;
}
