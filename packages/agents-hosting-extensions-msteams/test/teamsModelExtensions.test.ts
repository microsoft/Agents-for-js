import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { MessagingExtensionAction, TaskModuleRequest } from '@microsoft/teams.api'
import { teamsGetDataAs, teamsGetDataString } from '../src/teamsModelExtensions'

describe('TeamsModelExtensions', () => {
  it('should return typed data when teamsGetDataAs receives a task module request', () => {
    const request: TaskModuleRequest = {
      data: {
        title: 'Quarterly report',
        count: 3
      }
    }

    const data = teamsGetDataAs<{ title: string, count: number }>(request)

    assert.deepStrictEqual(data, { title: 'Quarterly report', count: 3 })
  })

  it('should return typed data when teamsGetDataAs receives a message extension action', () => {
    const action = {
      commandId: 'create',
      commandContext: 'compose',
      data: {
        id: 'item-1'
      }
    } as MessagingExtensionAction

    const data = teamsGetDataAs<{ id: string }>(action)

    assert.deepStrictEqual(data, { id: 'item-1' })
  })

  it('should return undefined when teamsGetDataAs receives no data', () => {
    assert.strictEqual(teamsGetDataAs({}), undefined)
    assert.strictEqual(teamsGetDataAs(undefined), undefined)
  })

  it('should return a string when teamsGetDataString receives request data', () => {
    const request: TaskModuleRequest = {
      data: {
        title: 'Quarterly report',
        count: 3
      }
    }

    assert.strictEqual(teamsGetDataString(request, 'title'), 'Quarterly report')
  })

  it('should return a string when teamsGetDataString receives raw data', () => {
    assert.strictEqual(teamsGetDataString({ title: 'Quarterly report' }, 'title'), 'Quarterly report')
  })

  it('should return the default value when teamsGetDataString receives missing or non-string data', () => {
    const request: TaskModuleRequest = {
      data: {
        count: 3
      }
    }

    assert.strictEqual(teamsGetDataString(request, 'missing'), '')
    assert.strictEqual(teamsGetDataString(request, 'count', 'fallback'), 'fallback')
    assert.strictEqual(teamsGetDataString(undefined, 'title', 'fallback'), 'fallback')
  })
})
