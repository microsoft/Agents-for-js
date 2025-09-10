import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { HeaderPropagation } from '../../src/headerPropagation'

const requestHeaders = {
  'x-ms-correlation-id': 'testCorrelationId',
  'x-propagate-header': 'testPropagateHeader',
  'x-override-header': 'OriginalValue',
  'user-agent': 'TestUserAgent/1.0',
}

describe('HeaderPropagation', () => {
  it('should validate that headers are provided', async () => {
    assert.throws(() => new HeaderPropagation(undefined as any))
  })

  it('should normalize headers', async () => {
    const headers = new HeaderPropagation({
      'X-HEADER': 'headerValue',
      'x-Header-List': ['One', 'Two'],
    })

    headers.add({ 'x-header-ADD': 'headerValue' })
    headers.propagate(['x-Header', 'x-header-list'])

    assert.deepStrictEqual(headers.incoming, {
      'x-header': 'headerValue',
      'x-header-list': 'One Two',
    })

    assert.deepStrictEqual(headers.outgoing, {
      'x-header': 'headerValue',
      'x-header-list': 'One Two',
      'x-header-add': 'headerValue',
    })
  })

  it('should propagate readonly x-ms-correlation-id request header', async () => {
    const headers = new HeaderPropagation(requestHeaders)

    headers.concat({ 'x-ms-correlation-id': 'ConcatenatedValue' })
    headers.override({ 'x-ms-correlation-id': 'OverriddenValue' })

    assert.strictEqual(headers.outgoing['x-ms-correlation-id'], requestHeaders['x-ms-correlation-id'])
  })

  it('should propagate headers once', async () => {
    const headers = new HeaderPropagation(requestHeaders)

    headers.propagate(['x-propagate-header'])
    headers.incoming['x-propagate-header'] = 'NewValue'
    headers.propagate(['x-propagate-header'])

    assert.notStrictEqual(headers.incoming['x-propagate-header'], requestHeaders['x-propagate-header'])
    assert.strictEqual(headers.outgoing['x-propagate-header'], requestHeaders['x-propagate-header'])
  })

  it('should add headers once', async () => {
    const headers = new HeaderPropagation(requestHeaders)

    headers.add({ 'x-new-header': 'NewValue' })
    headers.add({ 'x-new-header': 'NewValue2' })
    headers.add({ 'user-agent': 'NewUserAgent' })

    assert.strictEqual(headers.outgoing['x-new-header'], 'NewValue')
    assert.equal(headers.outgoing['user-agent'], undefined) // 'user-agent' should not be added since it already exists.
  })

  it('should concatenate headers', async () => {
    const headers = new HeaderPropagation(requestHeaders)

    headers.concat({ 'user-agent': 'UserAgent/1.0' })
    headers.concat({ 'user-agent': 'UserAgent/2.0' })

    assert.strictEqual(headers.outgoing['user-agent'], `${requestHeaders['user-agent']} UserAgent/1.0 UserAgent/2.0`)
  })

  it('should override headers', async () => {
    const headers = new HeaderPropagation(requestHeaders)

    headers.override({ 'x-override-header': 'OverriddenValue' })
    headers.override({ 'x-new-header': 'OverriddenValue' })

    assert.strictEqual(headers.outgoing['x-override-header'], 'OverriddenValue')
    assert.strictEqual(headers.outgoing['x-new-header'], 'OverriddenValue')
  })
})
