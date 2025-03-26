// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class AdaptiveCardTaskFetchValue<T> {
  type: object = { type: 'task/fetch' }
  data: T | undefined
}
