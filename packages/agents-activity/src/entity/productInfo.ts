/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '../activity'
import { Entity } from './entity'

export interface ProductInfo extends Entity {
  type: 'ProductInfo';
  id: string;
}

export const addProductInfoToActivity = (activity: Activity, id: string) : void => {
  const productInfo: ProductInfo = {
    type: 'ProductInfo',
    id
  }
  activity.entities ??= []
  activity.entities?.push(productInfo)
}
