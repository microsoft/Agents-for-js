/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export interface ModelResult<T extends Record<string, any> = {}> {
  text: string;
  start: number;
  end: number;
  typeName: string;
  resolution: T;
}
