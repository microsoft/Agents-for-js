/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { StatusCodes } from '../statusCodes'
import { InvokeResponse } from './invokeResponse'

export class InvokeException<T = unknown> extends Error {
  constructor (private readonly status: StatusCodes, private readonly response?: T) {
    super()
    this.name = 'InvokeException'
  }

  createInvokeResponse (): InvokeResponse {
    return {
      status: this.status,
      body: this.response
    }
  }
}
