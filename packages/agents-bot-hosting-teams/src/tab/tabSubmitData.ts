/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing data submitted from a tab.
 */
export interface TabSubmitData {
  /**
   * Type of the submitted data.
   */
  type?: string
  /**
   * Additional properties of the submitted data.
   */
  [properties: string]: unknown
}
