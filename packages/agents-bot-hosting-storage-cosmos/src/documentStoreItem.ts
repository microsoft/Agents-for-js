// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class DocumentStoreItem {
  static get partitionKeyPath (): string {
    return '/id'
  }

  id: string
  realId: string
  document: object
  eTag: string

  get partitionKey (): string {
    return this.id
  }

  constructor (storeItem: { id: string; realId: string; document: object; eTag?: string }) {
    this.id = storeItem.id
    this.realId = storeItem.realId || ''
    this.document = storeItem.document || {}
    this.eTag = storeItem.eTag || ''
  }
}
