// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents an item stored in the document store.
 */
export class DocumentStoreItem {
  /**
   * Gets the partition key path.
   */
  static get partitionKeyPath (): string {
    return '/id'
  }

  /**
   * The ID of the document.
   */
  id: string
  /**
   * The real ID of the document.
   */
  realId: string
  /**
   * The document object.
   */
  document: object
  /**
   * The ETag of the document.
   */
  eTag: string

  /**
   * Gets the partition key.
   */
  get partitionKey (): string {
    return this.id
  }

  /**
   * Initializes a new instance of the DocumentStoreItem class.
   * @param storeItem The store item to initialize.
   */
  constructor (storeItem: { id: string; realId: string; document: object; eTag?: string }) {
    this.id = storeItem.id
    this.realId = storeItem.realId || ''
    this.document = storeItem.document || {}
    this.eTag = storeItem.eTag || ''
  }
}
