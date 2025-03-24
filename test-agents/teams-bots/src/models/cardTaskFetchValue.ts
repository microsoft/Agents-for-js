// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class CardTaskFetchValue<T> {
  type: any = 'task/fetch'
  data: T | undefined
}
