import assert from 'assert'
import { describe, it } from 'node:test'
import { parseValueMessagingExtensionQuery } from '../src/messageExtensions/messagingExtensionQuery'
import { ZodError } from 'zod'

describe('parseValueMessagingExtensionQuery test', () => {
  it('should parse the query when all properties are present', () => {
    const messagingExtensionQueryObj = {
      commandId: 'commandId',
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 'state'
    }
    const messagingExtensionQuery = parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    assert.deepEqual(messagingExtensionQuery, messagingExtensionQueryObj)
  })

  it('should parse the query when commandId is absent', () => {
    const messagingExtensionQueryObj = {
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 'state'
    }
    const messagingExtensionQuery = parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    assert.deepEqual(messagingExtensionQuery, messagingExtensionQueryObj)
  })

  it('should throw when commandId has the wrong type', () => {
    const messagingExtensionQueryObj = {
      commandId: 1,
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 'state'
    }
    assert.throws(() => {
      parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    }, ZodError)
  })

  it('should parse the query when parameters are absent', () => {
    const messagingExtensionQueryObj = {
      commandId: 'commandId',
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 'state'
    }
    const messagingExtensionQuery = parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    assert.deepEqual(messagingExtensionQuery, messagingExtensionQueryObj)
  })

  it('should throw when parameters have the wrong type', () => {
    const messagingExtensionQueryObj = {
      commandId: 'commandId',
      parameters: {
        name: 1,
        value: 1
      },
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 'state'
    }
    assert.throws(() => {
      parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    }, ZodError)
  })

  it('should parse the query when queryOptions is absent', () => {
    const messagingExtensionQueryObj = {
      commandId: 'commandId',
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      state: 'state'
    }
    const messagingExtensionQuery = parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    assert.deepEqual(messagingExtensionQuery, messagingExtensionQueryObj)
  })

  it('should throw when queryOptions has the wrong type', () => {
    const messagingExtensionQueryObj = {
      commandId: 1,
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: '1',
        count: '1'
      },
      state: 'state'
    }
    assert.throws(() => {
      parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    }, ZodError)
  })

  it('should parse the query when state is absent', () => {
    const messagingExtensionQueryObj = {
      commandId: 'commandId',
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: 1,
        count: 1
      }
    }
    const messagingExtensionQuery = parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    assert.deepEqual(messagingExtensionQuery, messagingExtensionQueryObj)
  })

  it('should throw when state has the wrong type', () => {
    const messagingExtensionQueryObj = {
      commandId: 1,
      parameters: [{
        name: 'name',
        value: 'value'
      }],
      queryOptions: {
        skip: 1,
        count: 1
      },
      state: 1
    }
    assert.throws(() => {
      parseValueMessagingExtensionQuery(messagingExtensionQueryObj)
    }, ZodError)
  })
})
