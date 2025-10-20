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

// remove any previous ProductInfo entities
export const clearProductInfoFromActivity = (activity: Activity): void => {
  if (activity && activity.entities && activity.entities.length) {
    activity.entities = activity.entities.filter(e => e.type !== 'ProductInfo')
  }
}

export const addProductInfoToActivity = (activity: Activity, id: string) : void => {
  const productInfo: ProductInfo = {
    type: 'ProductInfo',
    id
  }
  activity.entities ??= []
  clearProductInfoFromActivity(activity)
  activity.entities?.push(productInfo)
}
