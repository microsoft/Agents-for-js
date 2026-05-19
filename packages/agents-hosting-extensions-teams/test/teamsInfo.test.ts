import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TurnContext } from '@microsoft/agents-hosting'
import { TeamsInfo } from '../src/teamsInfo'
import { TeamsApiClientKey } from '../src/teamsApiClient'

function createContext (channelData?: unknown, from?: { id?: string, aadObjectId?: string }): TurnContext {
  const adapter = { ConnectorClientKey: Symbol('ConnectorClient') } as any
  return new TurnContext(
    adapter,
    Activity.fromObject({
      type: ActivityTypes.Message,
      channelId: 'msteams',
      serviceUrl: 'https://service.example.com',
      conversation: { id: 'conv-1' },
      recipient: { id: 'bot' },
      from: from ?? { id: 'user-1', aadObjectId: 'aad-user-1' },
      channelData: channelData ?? {}
    })
  )
}

function createMockTeamsClient (overrides?: Record<string, any>) {
  return {
    serviceUrl: 'https://service.example.com',
    meetings: {
      getParticipant: async () => ({ user: {} }),
      getById: async () => ({ details: {} }),
      sendNotification: async () => undefined,
      ...overrides?.meetings
    },
    teams: {
      getById: async () => ({ id: 'team-1' }),
      getConversations: async () => [{ id: 'ch-1' }],
      ...overrides?.teams
    },
    conversations: {
      members: (conversationId: string) => ({
        getPaged: async () => ({ members: [], continuationToken: '' }),
        getById: async (userId: string) => ({ id: userId }),
        ...overrides?.members
      }),
      ...overrides?.conversations
    },
    ...overrides
  }
}

function setTeamsClient (context: TurnContext, client?: any): void {
  context.turnState.set(TeamsApiClientKey, client ?? createMockTeamsClient())
}

describe('TeamsInfo', () => {
  describe('getMeetingParticipant', () => {
    it('throws when context is null', async () => {
      await assert.rejects(
        () => TeamsInfo.getMeetingParticipant(null as any),
        (err: Error) => err.message.includes('context')
      )
    })

    it('throws when meetingId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getMeetingParticipant(context),
        (err: Error) => err.message.includes('meeting')
      )
    })

    it('throws when participantId cannot be resolved', async () => {
      const context = createContext({ meeting: { id: 'meeting-1' } }, { id: 'user-1' })
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getMeetingParticipant(context),
        (err: Error) => err.message.includes('participant')
      )
    })

    it('throws when tenantId cannot be resolved', async () => {
      const context = createContext({ meeting: { id: 'meeting-1' } })
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getMeetingParticipant(context),
        (err: Error) => err.message.includes('tenant')
      )
    })

    it('calls meetings.getParticipant with resolved parameters', async () => {
      let capturedArgs: any[] = []
      const context = createContext({
        meeting: { id: 'meeting-1' },
        tenant: { id: 'tenant-1' }
      })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getParticipant: async (...args: any[]) => {
            capturedArgs = args
            return { user: { id: 'aad-user-1' } }
          }
        }
      }))

      const result = await TeamsInfo.getMeetingParticipant(context)
      assert.deepStrictEqual(capturedArgs, ['meeting-1', 'aad-user-1', 'tenant-1'])
      assert.deepStrictEqual(result, { user: { id: 'aad-user-1' } })
    })

    it('uses explicit parameters over channelData values', async () => {
      let capturedArgs: any[] = []
      const context = createContext({
        meeting: { id: 'meeting-from-channel' },
        tenant: { id: 'tenant-from-channel' }
      })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getParticipant: async (...args: any[]) => {
            capturedArgs = args
            return {}
          }
        }
      }))

      await TeamsInfo.getMeetingParticipant(context, 'explicit-meeting', 'explicit-participant', 'explicit-tenant')
      assert.deepStrictEqual(capturedArgs, ['explicit-meeting', 'explicit-participant', 'explicit-tenant'])
    })
  })

  describe('getMeetingInfo', () => {
    it('throws when meetingId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getMeetingInfo(context),
        (err: Error) => err.message.includes('meeting')
      )
    })

    it('calls meetings.getById with resolved meetingId', async () => {
      let capturedId: string = ''
      const context = createContext({ meeting: { id: 'mtg-1' } })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getById: async (id: string) => {
            capturedId = id
            return { id: 'mtg-1', details: {} }
          }
        }
      }))

      const result = await TeamsInfo.getMeetingInfo(context)
      assert.strictEqual(capturedId, 'mtg-1')
      assert.deepStrictEqual(result, { id: 'mtg-1', details: {} })
    })

    it('uses explicit meetingId over channelData', async () => {
      let capturedId: string = ''
      const context = createContext({ meeting: { id: 'from-channel' } })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getById: async (id: string) => {
            capturedId = id
            return {}
          }
        }
      }))

      await TeamsInfo.getMeetingInfo(context, 'explicit-mtg')
      assert.strictEqual(capturedId, 'explicit-mtg')
    })
  })

  describe('getTeamDetails', () => {
    it('throws when teamId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getTeamDetails(context),
        (err: Error) => err.message.includes('team')
      )
    })

    it('calls teams.getById with resolved teamId', async () => {
      let capturedId: string = ''
      const context = createContext({ team: { id: 'team-abc' } })
      setTeamsClient(context, createMockTeamsClient({
        teams: {
          getById: async (id: string) => {
            capturedId = id
            return { id: 'team-abc', name: 'Team ABC' }
          },
          getConversations: async () => []
        }
      }))

      const result = await TeamsInfo.getTeamDetails(context)
      assert.strictEqual(capturedId, 'team-abc')
      assert.deepStrictEqual(result, { id: 'team-abc', name: 'Team ABC' })
    })
  })

  describe('getTeamChannels', () => {
    it('throws when teamId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getTeamChannels(context),
        (err: Error) => err.message.includes('team')
      )
    })

    it('calls teams.getConversations with resolved teamId', async () => {
      let capturedId: string = ''
      const context = createContext({ team: { id: 'team-xyz' } })
      setTeamsClient(context, createMockTeamsClient({
        teams: {
          getById: async () => ({}),
          getConversations: async (id: string) => {
            capturedId = id
            return [{ id: 'ch-1' }, { id: 'ch-2' }]
          }
        }
      }))

      const result = await TeamsInfo.getTeamChannels(context)
      assert.strictEqual(capturedId, 'team-xyz')
      assert.deepStrictEqual(result, [{ id: 'ch-1' }, { id: 'ch-2' }])
    })
  })

  describe('getPagedMembers', () => {
    it('delegates to getPagedTeamMembers when team id exists', async () => {
      let membersCallConversationId: string = ''
      const context = createContext({ team: { id: 'team-1' } })
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            membersCallConversationId = conversationId
            return {
              getPaged: async () => ({ members: [{ id: 'u-1' }], continuationToken: '' }),
              getById: async () => ({})
            }
          }
        }
      }))

      const result = await TeamsInfo.getPagedMembers(context)
      assert.strictEqual(membersCallConversationId, 'team-1')
      assert.deepStrictEqual(result.members, [{ id: 'u-1' }])
    })

    it('uses conversation id when no team id', async () => {
      let membersCallConversationId: string = ''
      const context = createContext({})
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            membersCallConversationId = conversationId
            return {
              getPaged: async () => ({ members: [{ id: 'u-2' }], continuationToken: '' }),
              getById: async () => ({})
            }
          }
        }
      }))

      const result = await TeamsInfo.getPagedMembers(context)
      assert.strictEqual(membersCallConversationId, 'conv-1')
      assert.deepStrictEqual(result.members, [{ id: 'u-2' }])
    })
  })

  describe('getMember', () => {
    it('delegates to team members when team id exists', async () => {
      let membersCallConversationId: string = ''
      let getByIdUserId: string = ''
      const context = createContext({ team: { id: 'team-m' } })
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            membersCallConversationId = conversationId
            return {
              getPaged: async () => ({ members: [], continuationToken: '' }),
              getById: async (userId: string) => {
                getByIdUserId = userId
                return { id: userId, name: 'User' }
              }
            }
          }
        }
      }))

      const result = await TeamsInfo.getMember(context, 'user-abc')
      assert.strictEqual(membersCallConversationId, 'team-m')
      assert.strictEqual(getByIdUserId, 'user-abc')
      assert.deepStrictEqual(result, { id: 'user-abc', name: 'User' })
    })

    it('uses conversation id when no team id', async () => {
      let membersCallConversationId: string = ''
      const context = createContext({})
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            membersCallConversationId = conversationId
            return {
              getPaged: async () => ({ members: [], continuationToken: '' }),
              getById: async (userId: string) => ({ id: userId })
            }
          }
        }
      }))

      await TeamsInfo.getMember(context, 'user-xyz')
      assert.strictEqual(membersCallConversationId, 'conv-1')
    })
  })

  describe('getPagedTeamMembers', () => {
    it('throws when teamId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.getPagedTeamMembers(context),
        (err: Error) => err.message.includes('team')
      )
    })

    it('calls conversations.members with resolved teamId', async () => {
      let capturedConversationId: string = ''
      let capturedPageSize: number | undefined
      let capturedToken: string | undefined
      const context = createContext({ team: { id: 'team-p' } })
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            capturedConversationId = conversationId
            return {
              getPaged: async (pageSize?: number, token?: string) => {
                capturedPageSize = pageSize
                capturedToken = token
                return { members: [], continuationToken: 'next' }
              },
              getById: async () => ({})
            }
          }
        }
      }))

      const result = await TeamsInfo.getPagedTeamMembers(context, 'team-p', 10, 'token-abc')
      assert.strictEqual(capturedConversationId, 'team-p')
      assert.strictEqual(capturedPageSize, 10)
      assert.strictEqual(capturedToken, 'token-abc')
      assert.strictEqual(result.continuationToken, 'next')
    })
  })

  describe('getTeamMember', () => {
    it('calls conversations.members.getById with teamId and userId', async () => {
      let capturedConversationId: string = ''
      let capturedUserId: string = ''
      const context = createContext({})
      setTeamsClient(context, createMockTeamsClient({
        conversations: {
          members: (conversationId: string) => {
            capturedConversationId = conversationId
            return {
              getPaged: async () => ({ members: [], continuationToken: '' }),
              getById: async (userId: string) => {
                capturedUserId = userId
                return { id: userId }
              }
            }
          }
        }
      }))

      const result = await TeamsInfo.getTeamMember(context, 'team-x', 'user-y')
      assert.strictEqual(capturedConversationId, 'team-x')
      assert.strictEqual(capturedUserId, 'user-y')
      assert.deepStrictEqual(result, { id: 'user-y' })
    })
  })

  describe('sendMeetingNotification', () => {
    it('throws when meetingId cannot be resolved', async () => {
      const context = createContext({})
      setTeamsClient(context)
      await assert.rejects(
        () => TeamsInfo.sendMeetingNotification(context, {} as any),
        (err: Error) => err.message.includes('meeting')
      )
    })

    it('calls meetings.sendNotification with resolved meetingId', async () => {
      let capturedMeetingId: string = ''
      let capturedNotification: any
      const context = createContext({ meeting: { id: 'mtg-notify' } })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getParticipant: async () => ({}),
          getById: async () => ({}),
          sendNotification: async (meetingId: string, notification: any) => {
            capturedMeetingId = meetingId
            capturedNotification = notification
            return undefined
          }
        }
      }))

      const notification = { type: 'targetedMeetingNotification' } as any
      const result = await TeamsInfo.sendMeetingNotification(context, notification)
      assert.strictEqual(capturedMeetingId, 'mtg-notify')
      assert.deepStrictEqual(capturedNotification, notification)
      assert.strictEqual(result, undefined)
    })

    it('uses explicit meetingId over channelData', async () => {
      let capturedMeetingId: string = ''
      const context = createContext({ meeting: { id: 'from-channel' } })
      setTeamsClient(context, createMockTeamsClient({
        meetings: {
          getParticipant: async () => ({}),
          getById: async () => ({}),
          sendNotification: async (meetingId: string) => {
            capturedMeetingId = meetingId
            return undefined
          }
        }
      }))

      await TeamsInfo.sendMeetingNotification(context, {} as any, 'explicit-mtg')
      assert.strictEqual(capturedMeetingId, 'explicit-mtg')
    })
  })
})
