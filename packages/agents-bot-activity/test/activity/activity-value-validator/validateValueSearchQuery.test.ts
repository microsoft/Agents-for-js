import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueSearchQuery } from '../../../src/activityValueValidators'

describe('validateValueSearchQuery test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 'dataset',
      queryOptions: {
        top: 1,
        skip: 1
      }
    }
    const parsedValue = validateValueSearchQuery(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with wrong queryText', () => {
    const valueObject = {
      queryText: 1,
      dataset: 'dataset',
      queryOptions: {
        top: 1,
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with no queryText', () => {
    const valueObject = {
      dataset: 'dataset',
      queryOptions: {
        top: 1,
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong dataset', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 1,
      queryOptions: {
        top: 1,
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with no dataset', () => {
    const valueObject = {
      queryText: 'queryText',
      queryOptions: {
        top: 1,
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong top', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 'dataset',
      queryOptions: {
        top: '1',
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with no top', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 'dataset',
      queryOptions: {
        skip: 1
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong skip', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 'dataset',
      queryOptions: {
        top: 1,
        skip: '1'
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })

  it('Should throw with no skip', () => {
    const valueObject = {
      queryText: 'queryText',
      dataset: 'dataset',
      queryOptions: {
        top: 1,
        skip: '1'
      }
    }
    assert.throws(() => {
      validateValueSearchQuery(valueObject)
    }, ZodError)
  })
})
