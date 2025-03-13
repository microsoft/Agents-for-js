/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Query<TParams extends Record<string, any>> {
  count: number;
  skip: number;
  parameters: TParams;
}
