/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'
import { describe, it } from 'mocha'
import * as assert from 'assert'

describe('Dialog ErrorHelper', () => {
  it('should generate exception with correct error code for MissingDialog', () => {
    try {
      throw ExceptionHelper.generateException(Error, Errors.MissingDialog)
    } catch (error: any) {
      assert.strictEqual(error.code, -130000)
      assert.ok(error.message.includes('runDialog(): missing dialog'))
      assert.ok(error.helpLink.includes('M365AgentsErrorCodesJS'))
    }
  })

  it('should generate exception with correct error code for RootDialogNotConfigured', () => {
    try {
      throw ExceptionHelper.generateException(Error, Errors.RootDialogNotConfigured)
    } catch (error: any) {
      assert.strictEqual(error.code, -130004)
      assert.ok(error.message.includes('rootDialog'))
    }
  })

  it('should generate exception with parameter substitution', () => {
    try {
      throw ExceptionHelper.generateException(
        Error,
        Errors.ScopeNotFound,
        undefined,
        { scope: 'testScope' }
      )
    } catch (error: any) {
      assert.strictEqual(error.code, -130009)
      assert.ok(error.message.includes('testScope'))
    }
  })

  it('should have all required properties in error definitions', () => {
    Object.keys(Errors).forEach((key) => {
      const errorDef = Errors[key]
      assert.ok(errorDef.code, `${key} should have a code`)
      assert.ok(errorDef.description, `${key} should have a description`)
      assert.ok(errorDef.helplink, `${key} should have a helplink`)
      assert.ok(errorDef.code < -130000 || errorDef.code > -139999, `${key} code should be in valid range`)
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((e) => e.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
