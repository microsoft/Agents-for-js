/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { isBlockedOutboundAddress, isPrivateOrLoopbackAddress } from '../../src/utils/ipAddress'

describe('shared IP address classification', () => {
  for (const address of [
    '127.0.0.1', '127.255.255.255', '10.1.2.3', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '::1', '[::1]', '0:0:0:0:0:0:0:1',
    'fc00::1', 'fdff::1', 'fe80::1', 'febf::1', 'fec0::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1',
    '::ffff:10.1.2.3', '::ffff:192.168.0.1', '::ffff:169.254.169.254'
  ]) {
    it(`classifies ${address} as private/local for both callers`, () => {
      assert.equal(isPrivateOrLoopbackAddress(address), true)
      assert.equal(isBlockedOutboundAddress(address), true)
    })
  }

  for (const address of ['0.0.0.0', '::', '0:0:0:0:0:0:0:0', '::ffff:0.0.0.0', 'invalid']) {
    it(`blocks ${address} outbound without allowing it as a sidecar address`, () => {
      assert.equal(isPrivateOrLoopbackAddress(address), false)
      assert.equal(isBlockedOutboundAddress(address), true)
    })
  }

  for (const address of [
    '100.64.0.0', '100.64.0.1', '100.127.255.255',
    '::ffff:100.64.0.0', '::ffff:100.64.0.1', '::ffff:100.127.255.255',
    '::ffff:6440:1', '0:0:0:0:0:ffff:647f:ffff', '[::ffff:6440:1]'
  ]) {
    it(`blocks RFC 6598 shared address ${address} without changing sidecar classification`, () => {
      assert.equal(isPrivateOrLoopbackAddress(address), false)
      assert.equal(isBlockedOutboundAddress(address), true)
    })
  }

  for (const address of [
    '8.8.8.8', '172.15.255.255', '172.32.0.0', '192.169.0.1', '169.255.0.1',
    '2001:4860:4860::8888', '::ffff:8.8.8.8', '0:0:0:0:0:ffff:808:808',
    '100.63.255.255', '100.128.0.0', '::ffff:100.63.255.255', '::ffff:100.128.0.0'
  ]) {
    it(`allows public address ${address} only in the outbound classifier`, () => {
      assert.equal(isPrivateOrLoopbackAddress(address), false)
      assert.equal(isBlockedOutboundAddress(address), false)
    })
  }
})
