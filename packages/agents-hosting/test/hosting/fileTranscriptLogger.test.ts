// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { FileTranscriptLogger } from '../../src/transcript/fileTranscriptLogger'
import { TranscriptStore } from '../../src/transcript/transcriptStore'

const testFolder = path.join(__dirname, 'FileTranscriptTests')

describe('FileTranscriptLogger', () => {
  let store: TranscriptStore

  beforeEach(async () => {
    store = new FileTranscriptLogger(testFolder)
    await cleanup()
  })

  afterEach(async () => {
    await cleanup()
  })

  describe('BadArgs', () => {
    it('should throw error when logging null activity', async () => {
      await assert.rejects(
        async () => await store.logActivity(null as any),
        (err: Error) => {
          assert.ok(err.message.toLowerCase().includes('activity is required'))
          return true
        }
      )
    })

    it('should throw error when getting transcript activities with null channelId', async () => {
      await assert.rejects(
        async () => await store.getTranscriptActivities(null as any, 'conversationId'),
        /channelId is required/
      )
    })

    it('should throw error when getting transcript activities with null conversationId', async () => {
      await assert.rejects(
        async () => await store.getTranscriptActivities('test', null as any),
        /conversationId is required/
      )
    })

    it('should throw error when listing transcripts with null channelId', async () => {
      await assert.rejects(
        async () => await store.listTranscripts(null as any),
        /channelId is required/
      )
    })

    it('should throw error when deleting transcript with null channelId', async () => {
      await assert.rejects(
        async () => await store.deleteTranscript(null as any, 'conversationId'),
        /channelId is required/
      )
    })

    it('should throw error when deleting transcript with null conversationId', async () => {
      await assert.rejects(
        async () => await store.deleteTranscript('test', null as any),
        /conversationId is required/
      )
    })
  })

  it('should log a single activity', async () => {
    const conversationId = '_LogActivity'
    const [activity] = createActivities(conversationId, new Date())

    await store.logActivity(activity)

    const results = await store.getTranscriptActivities('test', conversationId)
    assert.strictEqual(results.items.length, 1)
    assert.deepStrictEqual(results.items[0], activity)
  })

  it('should log activity with invalid channel and conversation IDs', async () => {
    const channelId = 'channelWith|invalidChars'
    const emulatorConversationId = '8b6e9a80-3c94-11eb-83c4-83172d04969b|livechat'

    const activity = Activity.fromObject({
      type: ActivityTypes.Message,
      timestamp: new Date(),
      id: randomUUID(),
      text: 'text',
      channelId,
      from: { id: 'User' },
      conversation: { id: emulatorConversationId },
      recipient: { id: 'Bot1', name: '2' },
      serviceUrl: 'http://foo.com/api/messages'
    })

    await store.logActivity(activity)

    const results = await store.getTranscriptActivities(channelId, emulatorConversationId)
    assert.strictEqual(results.items.length, 1)
    assert.deepStrictEqual(results.items[0], activity)
  })

  it('should log multiple activities and handle updates and deletes', async () => {
    const conversationId = 'LogMultipleActivities'
    const start = new Date()
    const activities = createActivities(conversationId, start)

    // Log all activities
    for (const activity of activities) {
      await store.logActivity(activity)
    }

    // Update first activity
    const updateActivity = activities[0].clone() as Activity
    const originalType = updateActivity.type
    updateActivity.text = 'updated'
    updateActivity.type = ActivityTypes.MessageUpdate
    await store.logActivity(updateActivity)
    activities[0].text = 'updated'
    activities[0].type = originalType

    // Delete second activity
    const deleteActivity = Activity.fromObject({
      type: ActivityTypes.MessageDelete,
      timestamp: new Date(),
      id: activities[1].id,
      channelId: activities[1].channelId,
      from: activities[1].from,
      conversation: activities[1].conversation,
      recipient: activities[1].recipient,
      serviceUrl: activities[1].serviceUrl
    })
    await store.logActivity(deleteActivity)

    // Tombstone the deleted record
    activities[1] = Activity.fromObject({
      type: ActivityTypes.MessageDelete,
      id: activities[1].id,
      from: { id: 'deleted' },
      recipient: { id: 'deleted' },
      localTimestamp: activities[1].timestamp,
      timestamp: activities[1].timestamp,
      channelId: activities[1].channelId,
      conversation: activities[1].conversation,
      serviceUrl: activities[1].serviceUrl,
    })

    // Verify bogus channel returns empty results
    let pagedResult = await store.getTranscriptActivities('bogus', conversationId)
    assert.strictEqual(pagedResult.continuationToken, undefined)
    assert.strictEqual(pagedResult.items.length, 0)

    // Verify bogus conversation returns empty results
    pagedResult = await store.getTranscriptActivities('test', 'bogus')
    assert.strictEqual(pagedResult.continuationToken, undefined)
    assert.strictEqual(pagedResult.items.length, 0)

    // Verify all activities
    pagedResult = await store.getTranscriptActivities('test', conversationId)
    assert.strictEqual(pagedResult.continuationToken, undefined)
    assert.strictEqual(pagedResult.items.length, activities.length)

    let indexActivity = 0
    for (const result of pagedResult.items.sort((a, b) =>
      new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    )) {
      assert.deepStrictEqual(result, activities[indexActivity++])
    }

    // Verify filtering by start date
    const startDate = new Date(start.getTime() + 5 * 60 * 1000) // start + 5 minutes
    pagedResult = await store.getTranscriptActivities('test', conversationId, undefined, startDate)
    assert.strictEqual(pagedResult.items.length, Math.floor(activities.length / 2))

    indexActivity = 5
    for (const result of pagedResult.items.sort((a, b) =>
      new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    )) {
      assert.deepStrictEqual(result, activities[indexActivity++])
    }
  })

  it('should handle logging errors gracefully', async () => {
    const conversationId = 'LogActivitiesShouldCatchException'

    // Create activity with circular reference to cause JSON serialization error
    const activity: any = Activity.fromObject({
      type: ActivityTypes.Message,
      channelId: 'test',
      from: { id: 'User-1' },
      conversation: { id: conversationId }
    })

    // Add circular reference
    activity.channelData = activity

    // Should throw during serialization
    await assert.rejects(
      async () => await store.logActivity(activity),
      /circular|Converting circular structure/i
    )
  })

  it('should delete a specific transcript', async () => {
    const conversationId = '_DeleteConversation'
    const start = new Date()
    const activities = createActivities(conversationId, start)

    for (const activity of activities) {
      await store.logActivity(activity)
    }

    const conversationId2 = '_DeleteConversation2'
    const activities2 = createActivities(conversationId2, new Date())

    for (const activity of activities2) {
      await store.logActivity(activity)
    }

    let pagedResult = await store.getTranscriptActivities('test', conversationId)
    let pagedResult2 = await store.getTranscriptActivities('test', conversationId2)

    assert.strictEqual(pagedResult.items.length, activities.length)
    assert.strictEqual(pagedResult2.items.length, activities2.length)

    await store.deleteTranscript('test', conversationId)

    pagedResult = await store.getTranscriptActivities('test', conversationId)
    pagedResult2 = await store.getTranscriptActivities('test', conversationId2)

    assert.strictEqual(pagedResult.items.length, 0)
    assert.strictEqual(pagedResult2.items.length, activities2.length)
  })

  it('should retrieve activities with pagination', async () => {
    const conversationId = '_GetConversationActivitiesPaging'
    const start = new Date()
    const activities = createActivities(conversationId, start, 50)

    // Log in parallel batches of 10
    await runInBatches(activities, 10, a => store.logActivity(a))

    const seen = new Set<string>()
    let continuationToken: string | undefined
    let pageSize = 0

    do {
      const pagedResult = await store.getTranscriptActivities('test', conversationId, continuationToken)
      assert.ok(pagedResult)
      assert.ok(pagedResult.items)

      // NOTE: Assumes page size is consistent
      if (pageSize === 0) {
        pageSize = pagedResult.items.length
      } else if (pageSize === pagedResult.items.length) {
        assert.ok(pagedResult.continuationToken?.trim())
      }

      for (const item of pagedResult.items) {
        assert.ok(!seen.has(item.id!))
        seen.add(item.id!)
      }

      continuationToken = pagedResult.continuationToken
    } while (continuationToken)

    assert.strictEqual(seen.size, activities.length)

    for (const activity of activities) {
      assert.ok(seen.has(activity.id!))
    }
  })

  it('should retrieve activities filtered by start date', async () => {
    const conversationId = '_GetConversationActivitiesStartDate'
    const start = new Date()
    const activities = createActivities(conversationId, start, 50)

    // Log in parallel batches of 10
    await runInBatches(activities, 10, a => store.logActivity(a))

    const seen = new Set<string>()
    const startDate = new Date(start.getTime() + 50 * 60 * 1000) // start + 50 minutes
    let continuationToken: string | undefined
    let pageSize = 0

    do {
      const pagedResult = await store.getTranscriptActivities('test', conversationId, continuationToken, startDate)
      assert.ok(pagedResult)
      assert.ok(pagedResult.items)

      // NOTE: Assumes page size is consistent
      if (pageSize === 0) {
        pageSize = pagedResult.items.length
      } else if (pageSize === pagedResult.items.length) {
        assert.ok(pagedResult.continuationToken?.trim())
      }

      for (const item of pagedResult.items) {
        assert.ok(!seen.has(item.id!))
        seen.add(item.id!)
      }

      continuationToken = pagedResult.continuationToken
    } while (continuationToken)

    assert.strictEqual(seen.size, Math.floor(activities.length / 2))

    for (const activity of activities.filter(a => new Date(a.timestamp!).getTime() >= startDate.getTime())) {
      assert.ok(seen.has(activity.id!))
    }

    for (const activity of activities.filter(a => new Date(a.timestamp!).getTime() < startDate.getTime())) {
      assert.ok(!seen.has(activity.id!))
    }
  })

  it('should list all transcripts for a channel', async () => {
    const conversationIds: string[] = []
    const start = new Date()

    for (let i = 0; i < 100; i++) {
      conversationIds.push(`_ListConversations${i}`)
    }

    const activities: Activity[] = []
    for (const conversationId of conversationIds) {
      activities.push(...createActivities(conversationId, start, 1))
    }

    // Log in parallel batches of 10
    await runInBatches(activities, 10, a => store.logActivity(a))

    const seen = new Set<string>()
    let continuationToken: string | undefined
    let pageSize = 0

    do {
      const pagedResult = await store.listTranscripts('test', continuationToken)
      assert.ok(pagedResult)
      assert.ok(pagedResult.items)

      // NOTE: Assumes page size is consistent
      if (pageSize === 0) {
        pageSize = pagedResult.items.length
      } else if (pageSize === pagedResult.items.length) {
        assert.ok(pagedResult.continuationToken?.trim())
      }

      for (const item of pagedResult.items) {
        assert.ok(!seen.has(item.id))
        if (item.id.startsWith('_ListConversations')) {
          seen.add(item.id)
        }
      }

      continuationToken = pagedResult.continuationToken
    } while (continuationToken)

    assert.strictEqual(seen.size, conversationIds.length)

    for (const conversationId of conversationIds) {
      assert.ok(seen.has(conversationId))
    }
  })

  it('should handle concurrent writes without corruption', async () => {
    const conversationId = '_ConcurrentWrites'
    const numberOfWrites = 50
    const activities = createActivities(conversationId, new Date(), numberOfWrites / 2)

    // Write all activities concurrently
    await Promise.all(activities.map(activity => store.logActivity(activity)))

    // Verify all activities were logged
    const result = await store.getTranscriptActivities('test', conversationId)
    assert.strictEqual(result.items.length, activities.length)

    // Verify no corruption - check that all IDs are present
    const loggedIds = result.items.map(a => a.id)
    const expectedIds = activities.map(a => a.id)
    assert.strictEqual(loggedIds.length, expectedIds.length)
    for (const id of expectedIds) {
      assert.ok(loggedIds.includes(id))
    }

    // Verify JSON is valid
    const transcriptFile = path.join(testFolder, 'test', `${conversationId}.transcript`)
    const content = await fs.readFile(transcriptFile, 'utf-8')
    assert.doesNotThrow(() => JSON.parse(content))
  })

  it('should handle concurrent writes to multiple conversations', async () => {
    const numberOfConversations = 5
    const activitiesPerConversation = 10
    const allActivities: Array<{ conversationId: string, activity: Activity }> = []

    for (let conv = 0; conv < numberOfConversations; conv++) {
      const conversationId = `_ConcurrentConv${conv}`
      const activities = createActivities(conversationId, new Date(), activitiesPerConversation / 2)

      for (const activity of activities) {
        allActivities.push({ conversationId, activity })
      }
    }

    await Promise.all(allActivities.map(({ activity }) => store.logActivity(activity)))

    // Verify each conversation has the correct number of activities
    for (let conv = 0; conv < numberOfConversations; conv++) {
      const conversationId = `_ConcurrentConv${conv}`
      const result = await store.getTranscriptActivities('test', conversationId)
      assert.strictEqual(result.items.length, activitiesPerConversation)
    }
  })

  it('should handle concurrent mixed operations (append, update, delete)', async () => {
    const conversationId = '_MixedOps'
    const numberOfActivities = 20
    const activities = createActivities(conversationId, new Date(), numberOfActivities / 2)

    // First, log all activities sequentially to establish baseline
    for (const activity of activities) {
      await store.logActivity(activity)
    }

    // Verify all were logged
    let result = await store.getTranscriptActivities('test', conversationId)
    assert.strictEqual(result.items.length, activities.length)

    // Now perform mixed operations concurrently in a scrambled manner
    const operations: Activity[] = []

    // Add some new activities (appends)
    for (let i = 0; i < 5; i++) {
      const newActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        timestamp: new Date(),
        id: randomUUID(),
        text: `new-${i}`,
        channelId: 'test',
        from: { id: `NewUser${i}` },
        conversation: { id: conversationId },
        recipient: { id: 'Bot1', name: '2' },
        serviceUrl: 'http://foo.com/api/messages'
      })
      operations.push(newActivity)
    }

    // Update some existing activities
    for (let i = 0; i < 5; i++) {
      const activityToUpdate = activities[i].clone() as Activity
      activityToUpdate.text = `updated-${i}`
      activityToUpdate.type = ActivityTypes.MessageUpdate
      operations.push(activityToUpdate)
    }

    // Delete some activities
    for (let i = 5; i < 10; i++) {
      const deleteActivity = Activity.fromObject({
        type: ActivityTypes.MessageDelete,
        timestamp: new Date(),
        id: activities[i].id,
        channelId: activities[i].channelId,
        from: activities[i].from,
        conversation: activities[i].conversation,
        recipient: activities[i].recipient,
        serviceUrl: activities[i].serviceUrl
      })
      operations.push(deleteActivity)
    }

    // Add more appends interleaved
    for (let i = 5; i < 10; i++) {
      const newActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        timestamp: new Date(),
        id: randomUUID(),
        text: `newer-${i}`,
        channelId: 'test',
        from: { id: `NewUser${i}` },
        conversation: { id: conversationId },
        recipient: { id: 'Bot1', name: '2' },
        serviceUrl: 'http://foo.com/api/messages'
      })
      operations.push(newActivity)
    }

    // Shuffle operations to scramble the order
    for (let i = operations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [operations[i], operations[j]] = [operations[j], operations[i]]
    }

    // Execute all operations concurrently
    await Promise.all(operations.map(activity => store.logActivity(activity)))

    // Verify the final state
    result = await store.getTranscriptActivities('test', conversationId)

    // Should have: original 20 + 10 new appends = 30 total
    assert.strictEqual(result.items.length, 30)

    // Verify updates were applied (check first 5 have updated text)
    const updatedActivities = result.items.filter(a => a.text?.startsWith('updated-'))
    assert.strictEqual(updatedActivities.length, 5)

    // Verify deletes were applied (5 activities should be tombstoned)
    const deletedActivities = result.items.filter(a => a.type === ActivityTypes.MessageDelete)
    assert.strictEqual(deletedActivities.length, 5)

    // Verify new activities were appended
    const newActivities = result.items.filter(a => a.text?.startsWith('new-') || a.text?.startsWith('newer-'))
    assert.strictEqual(newActivities.length, 10)

    // Verify JSON integrity
    const transcriptFile = path.join(testFolder, 'test', `${conversationId}.transcript`)
    const content = await fs.readFile(transcriptFile, 'utf-8')
    assert.doesNotThrow(() => JSON.parse(content))
  })

  describe('Platform-specific character sanitization', () => {
    it('should sanitize invalid filename characters', async () => {
      const logger = store as any // Access private methods
      const invalidChars = logger.getInvalidFileNameChars()

      // Windows should have more invalid chars than Unix
      if (process.platform === 'win32') {
        assert.ok(invalidChars.includes('<'))
        assert.ok(invalidChars.includes('>'))
        assert.ok(invalidChars.includes(':'))
        assert.ok(invalidChars.includes('"'))
        assert.ok(invalidChars.includes('|'))
        assert.ok(invalidChars.includes('?'))
        assert.ok(invalidChars.includes('*'))
        assert.ok(invalidChars.includes('/'))
        assert.ok(invalidChars.includes('\\'))
        assert.ok(invalidChars.includes('\0'))
      } else {
        // Unix systems: at least / should be invalid
        assert.ok(invalidChars.includes('/'))
        assert.ok(invalidChars.includes('\0'))
      }
    })

    it('should sanitize invalid path characters', async () => {
      const logger = store as any // Access private methods
      const invalidChars = logger.getInvalidPathChars()

      if (process.platform === 'win32') {
        // Windows path invalid chars (but allows / and \ for directory separators)
        assert.ok(invalidChars.includes('<'))
        assert.ok(invalidChars.includes('>'))
        assert.ok(invalidChars.includes(':'))
        assert.ok(invalidChars.includes('"'))
        assert.ok(invalidChars.includes('|'))
        assert.ok(invalidChars.includes('?'))
        assert.ok(invalidChars.includes('*'))
        // Should NOT include / and \ in path chars (allowed as separators)
        assert.ok(!invalidChars.includes('/'))
        assert.ok(!invalidChars.includes('\\'))
        assert.ok(invalidChars.includes('\0'))
      } else {
        // Unix systems: only null byte is invalid
        assert.ok(invalidChars.includes('\0'))
        assert.strictEqual(invalidChars.length, 1)
      }
    })

    it('should handle activities with invalid filename characters in conversation ID', async () => {
      // Test with various invalid characters depending on platform
      // Use unique suffixes to prevent sanitized names from colliding
      const invalidCharsToTest = process.platform === 'win32'
        ? ['<test>_1', 'test:id_2', 'test|conv_3', 'test?id_4', 'test*id_5', 'test/conv_6', 'test\\conv_7', 'test\0conv_2']
        : ['test/conv_1', 'test\0conv_2']

      for (const conversationId of invalidCharsToTest) {
        const activity = Activity.fromObject({
          type: ActivityTypes.Message,
          timestamp: new Date(),
          id: randomUUID(),
          text: 'test',
          channelId: 'test',
          from: { id: 'User' },
          conversation: { id: conversationId },
          recipient: { id: 'Bot1', name: '2' },
          serviceUrl: 'http://foo.com/api/messages'
        })

        // Should not throw - characters should be sanitized
        await store.logActivity(activity)

        // Verify we can retrieve the activity
        const results = await store.getTranscriptActivities('test', conversationId)
        assert.strictEqual(results.items.length, 1)
        assert.deepStrictEqual(results.items[0], activity)
      }
    })

    it('should handle activities with invalid path characters in channel ID', async () => {
      // Test with various invalid characters depending on platform
      const invalidCharsToTest = process.platform === 'win32'
        ? ['<chan>', 'chan:id', 'chan|id', 'chan?id', 'chan*id', 'chan\0id']
        : ['chan\0id']

      for (const channelId of invalidCharsToTest) {
        const conversationId = `_InvalidPathChars_${randomUUID()}`
        const activity = Activity.fromObject({
          type: ActivityTypes.Message,
          timestamp: new Date(),
          id: randomUUID(),
          text: 'test',
          channelId,
          from: { id: 'User' },
          conversation: { id: conversationId },
          recipient: { id: 'Bot1', name: '2' },
          serviceUrl: 'http://foo.com/api/messages'
        })

        // Should not throw - characters should be sanitized
        await store.logActivity(activity)

        // Verify we can retrieve the activity
        const results = await store.getTranscriptActivities(channelId, conversationId)
        assert.strictEqual(results.items.length, 1)
        assert.deepStrictEqual(results.items[0], activity)
      }
    })
  })
})

/**
 * Helper function to create test activities
 * @remarks Creates pairs of user and bot messages with 1-minute intervals, thus the count is doubled.
 */
function createActivities (conversationId: string, ts: Date, count: number = 5): Activity[] {
  const activities: Activity[] = []
  let timestamp = new Date(ts.getTime())

  for (let i = 1; i <= count; i++) {
    let activity = Activity.fromObject({
      type: ActivityTypes.Message,
      timestamp: new Date(timestamp.getTime()),
      id: randomUUID(),
      text: i.toString(),
      channelId: 'test',
      from: { id: `User${i}` },
      conversation: { id: conversationId },
      recipient: { id: 'Bot1', name: '2' },
      serviceUrl: 'http://foo.com/api/messages'
    })
    activities.push(activity)
    timestamp = new Date(timestamp.getTime() + 60 * 1000) // +1 minute

    activity = Activity.fromObject({
      type: ActivityTypes.Message,
      timestamp: new Date(timestamp.getTime()),
      id: randomUUID(),
      text: i.toString(),
      channelId: 'test',
      from: { id: 'Bot1', name: '2' },
      conversation: { id: conversationId },
      recipient: { id: `User${i}` },
      serviceUrl: 'http://foo.com/api/messages'
    })
    activities.push(activity)
    timestamp = new Date(timestamp.getTime() + 60 * 1000) // +1 minute
  }

  return activities
}

/**
 * Helper function to run async operations in batches
 */
async function runInBatches<T> (items: T[], size: number, fn: (item: T) => Promise<void> | void) {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    await Promise.all(batch.map(item => Promise.resolve(fn(item))))
  }
}

/**
 * Helper function to clean up test folder
 */
async function cleanup () {
  // Clean up test folder before each test
  await fs.rm(testFolder, { recursive: true, force: true })
}
