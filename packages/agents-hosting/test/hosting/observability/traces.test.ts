// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { AgentApplicationTraceDefinitions } from '../../../src/observability/traces'

describe('AgentApplicationTraceDefinitions.run', () => {
  it('should add a named activity to the turn span', () => {
    const attributes = endRunTrace(Activity.fromObject({
      type: 'event',
      name: 'application/vnd.contoso.order',
      channelId: 'msteams',
    }))

    assert.equal(attributes['activity.name'], 'application/vnd.contoso.order')
  })

  it('should set activity.name to unknown when the activity has no name', () => {
    const attributes = endRunTrace(Activity.fromObject({ type: 'message' }))

    assert.equal(attributes['activity.name'], 'unknown')
  })
})

function endRunTrace (activity: Activity): Record<string, unknown> {
  let attributes: Record<string, unknown> = {}

  AgentApplicationTraceDefinitions.run.end({
    span: {
      setAttributes: (values: Record<string, unknown>) => { attributes = values }
    } as any,
    record: {
      authorized: true,
      activity,
      routeMatched: true,
    },
    duration: 0,
  })

  return attributes
}
