/* eslint-disable @typescript-eslint/no-unused-vars */
import assert from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { ZodError } from 'zod'
import { Activity, ActivityEventNames, ActivityImportance, ActivityTypes, AttachmentLayoutTypes, DeliveryModes, EndOfConversationCodes, ChannelAccount, InputHints, RoleTypes, TextFormatTypes, ConversationReference, Mention, Entity } from '../../src'

describe('Activity type instances', () => {
  beforeEach(() => {
    const obj = {}
  })

  it('use ctor with type enum', () => {
    const a: Activity = new Activity(ActivityTypes.Message)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.from, undefined)
    assert.strictEqual(a.id, undefined)
  })

  it('use ctor with type string', () => {
    const a: Activity = new Activity('mycustomtype')
    assert.strictEqual(a.type, 'mycustomtype')
    assert.notStrictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.from, undefined)
  })

  it('ctor fails with type string empty', () => {
    assert.throws(() => {
      const a: Activity = new Activity('')
    }, Error)
  })

  it('ctor fails with type string null', () => {
    assert.throws(() => {
      // @ts-expect-error
      const a: Activity = new Activity(null)
    }, Error)
  })

  it('literal with type message and text and no channelId', () => {
    const obj = {
      type: ActivityTypes.Message,
      text: 'my text',
      channelId: '123'
    }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.text, 'my text')
    assert.strictEqual(a.channelId, '123')
  })

  it('literal with type message and text and channelId', () => {
    const from: ChannelAccount = {
      id: '234',
      name: 'myName'
    }
    const obj = {
      type: ActivityTypes.Message,
      id: '111',
      text: 'my text',
      channelId: '123',
      from
    }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.id, '111')
    assert.strictEqual(a.text, 'my text')
    assert.strictEqual(a.channelId, '123')
    assert.strictEqual(a.from?.id, '234')
    assert.strictEqual(a.from?.name, 'myName')
  })

  it('literal with type message and no text', () => {
    const a: Activity = new Activity(ActivityTypes.Message)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.text, undefined)
    assert.strictEqual(a.channelId, undefined)
  })

  it('literal with type message and no text and extra field', () => {
    const obj = { type: ActivityTypes.Message, myProp: 3 }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.text, undefined)
    assert.strictEqual(a.myProp, 3)
  })

  it('literal with type as bool fails and no text and extra field', () => {
    // @ts-expect-error
    const a: Activity = { type: false, myProp: 3 }
    assert.strictEqual(a.type, false)
    assert.strictEqual(a.myProp, 3)
  })
})

describe('Activity json deserialization', () => {
  it('Deserialize with known type, text, and from', () => {
    const json = '{ "type" : "message", "id" : "1a", "text" : "my Text", "channelId" : "123", "from" : { "id" : "321", "name" : "yo" } }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.type, ActivityTypes.Message)
    assert.strictEqual(a1.id, '1a')
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.channelId, '123')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.from?.id, '321')
    assert.strictEqual(a1.from?.name, 'yo')
    assert.strictEqual(a1.from.role, undefined)
  })

  it('Deserialize with known type, text, and from with role', () => {
    const json = '{ "type" : "message", "text" : "my Text", "channelId" : "123", "from" : { "id" : "321", "name" : "yo", "role" : "user" } }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.type, ActivityTypes.Message)
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.channelId, '123')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.from?.id, '321')
    assert.strictEqual(a1.from?.name, 'yo')
    assert.strictEqual(a1.from.role, RoleTypes.User)
    assert.strictEqual(a1.from.role, 'user')
  })

  it('Deserialize with unknown type and text', () => {
    const json = '{ "type" : "myType", "text" : "my Text", "customField" : 33 }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'myType')
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.from, undefined)
    assert.strictEqual(a1.customField, 33)
  })

  it('Deserialize with known type and importance', () => {
    const json = '{ "type" : "message", "importance" : "low" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.importance, 'low')
  })

  it('Deserialize with known type and textFormat', () => {
    const json = '{ "type" : "message", "textFormat" : "markdown" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.textFormat, 'markdown')
  })

  it('Deserialize with known type and attachmentLayout', () => {
    const json = '{ "type" : "message", "attachmentLayout" : "list" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.attachmentLayout, 'list')
  })

  it('Deserialize with known type and inputHint', () => {
    const json = '{ "type" : "message", "inputHint" : "acceptingInput" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.inputHint, 'acceptingInput')
  })

  it('Deserialize with known type and name', () => {
    const json = '{ "type" : "message", "name" : "ContinueConversation" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.name, 'ContinueConversation')
  })

  it('Deserialize with known type and code', () => {
    const json = '{ "type" : "message", "code" : "completedSuccessfully" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.code, 'completedSuccessfully')
  })

  it('Deserialize with known type and deliveryMode', () => {
    const json = '{ "type" : "message", "deliveryMode" : "normal" }'
    const a1: Activity = Activity.fromJson(json)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.deliveryMode, 'normal')
  })

  it('Deserialize with type bool throws', () => {
    const json = '{ "type" : false, "text" : "my Text" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize with type null throws', () => {
    const json = '{ "type" : null, "text" : "my Text" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize without type throws', () => {
    const json = '{ "text" : "my Text" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize with type empty throws', () => {
    const json = '{ "type" : "", "text" : "my Text" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize with id as object', () => {
    const json = '{ "type" : "message", "id" : {}, "text" : "my Text" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize with from.role as bool throws', () => {
    const json = '{ "type" : "message", "text" : "my Text", "from" : { "id" : "321", "name" : "yo", "role" : true } }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json)
    }, ZodError)
  })

  it('Deserialize with channelId bool should throw', () => {
    const json1 = '{ "type" : "message", "text" : "my Text", "channelId" : true }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with channelId null should throw', () => {
    const json1 = '{ "type" : "message", "text" : "my Text", "channelId" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with importance null should throw', () => {
    const json1 = '{ "type" : "message", "importance" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with importance empty should throw', () => {
    const json1 = '{ "type" : "message", "importance" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with textFormat null should throw', () => {
    const json1 = '{ "type" : "message", "textFormat" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with textFormat empty should throw', () => {
    const json1 = '{ "type" : "message", "textFormat" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with attachmentLayout null should throw', () => {
    const json1 = '{ "type" : "message", "attachmentLayout" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with attachmentLayout empty should throw', () => {
    const json1 = '{ "type" : "message", "attachmentLayout" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with inputHint null should throw', () => {
    const json1 = '{ "type" : "message", "inputHint" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with inputHint empty should throw', () => {
    const json1 = '{ "type" : "message", "inputHint" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with name null should throw', () => {
    const json1 = '{ "type" : "message", "name" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with name empty should throw', () => {
    const json1 = '{ "type" : "message", "name" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with code null should throw', () => {
    const json1 = '{ "type" : "message", "code" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with code empty should throw', () => {
    const json1 = '{ "type" : "message", "code" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with deliveryMode null should throw', () => {
    const json1 = '{ "type" : "message", "deliveryMode" : null }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })

  it('Deserialize with deliveryMode empty should throw', () => {
    const json1 = '{ "type" : "message", "deliveryMode" : "" }'
    assert.throws(() => {
      const a1: Activity = Activity.fromJson(json1)
    }, ZodError)
  })
})

describe('Activity object deserialization', () => {
  it('Deserialize with known type and text', () => {
    const from: ChannelAccount = {
      id: '123',
      name: 'myChannel',
      role: RoleTypes.Bot
    }
    const obj = {
      type: ActivityTypes.Message,
      text: 'my Text',
      myField: 3,
      from
    }
    const a1: Activity = Activity.fromObject(obj)
    assert.strictEqual(a1.type, 'message')
    assert.strictEqual(a1.type, ActivityTypes.Message)
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.myField, 3)
    assert.strictEqual(a1.from?.id, '123')
    assert.strictEqual(a1.from?.name, 'myChannel')
    assert.strictEqual(a1.from?.role, 'bot')
    assert.strictEqual(a1.from?.role, RoleTypes.Bot)
  })

  it('Deserialize with unknown type and text', () => {
    const obj = { type: 'myType', text: 'my Text' }
    const a1: Activity = Activity.fromObject(obj)
    assert.strictEqual(a1.type, 'myType')
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.from, undefined)
    // @ts-expect-error
    assert.strictEqual(a1.from?.id, undefined)
  })

  it('Deserialize with known type 2 and text', () => {
    const obj = { type: ActivityTypes.CommandResult, text: 'my Text' }
    const a1: Activity = Activity.fromObject(obj)
    assert.strictEqual(a1.type, 'commandResult')
    assert.strictEqual(a1.type, ActivityTypes.CommandResult)
    assert.strictEqual(a1.text, 'my Text')
    assert.strictEqual(a1.xx, undefined)
    assert.strictEqual(a1.from, undefined)
    // @ts-expect-error
    assert.strictEqual(a1.from?.id, undefined)
  })

  it('Deserialize without type  throws', () => {
    // @ts-expect-error
    const obj: Activity = { text: 'my Text' }
    assert.throws(() => {
      const a1: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with empty type  throws', () => {
    const obj = { type: '', text: 'my Text' }
    assert.throws(() => {
      const a1: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with number bool throws', () => {
    // @ts-expect-error
    const obj: Activity = { type: 2, text: 'my Text' }
    assert.throws(() => {
      const a1: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with id bool throws', () => {
    // @ts-expect-error
    const obj: Activity = { type: ActivityTypes.Command, id: true, text: 'my Text' }
    assert.throws(() => {
      const a1: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with importance', () => {
    const obj = { type: ActivityTypes.CommandResult, importance: ActivityImportance.High }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.importance, 'high')
    assert.strictEqual(a.importance, ActivityImportance.High)
  })

  it('Deserialize with empty importance value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, importance: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with importance number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, importance: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with textFormat', () => {
    const obj = { type: ActivityTypes.CommandResult, textFormat: TextFormatTypes.Markdown }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.textFormat, 'markdown')
    assert.strictEqual(a.textFormat, TextFormatTypes.Markdown)
  })

  it('Deserialize with empty textFormat value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, textFormat: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with textFormat number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, textFormat: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with attachmentLayout', () => {
    const obj = { type: ActivityTypes.CommandResult, attachmentLayout: AttachmentLayoutTypes.Carousel }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.attachmentLayout, 'carousel')
    assert.strictEqual(a.attachmentLayout, AttachmentLayoutTypes.Carousel)
  })

  it('Deserialize with empty attachmentLayout value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, attachmentLayout: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with attachmentLayout number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, attachmentLayout: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with inputHint', () => {
    const obj = { type: ActivityTypes.CommandResult, inputHint: InputHints.AcceptingInput }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.inputHint, 'acceptingInput')
    assert.strictEqual(a.inputHint, InputHints.AcceptingInput)
  })

  it('Deserialize with empty inputHint value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, inputHint: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with inputHint number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, inputHint: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with name', () => {
    const obj = { type: ActivityTypes.CommandResult, name: ActivityEventNames.ContinueConversation }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.name, 'ContinueConversation')
    assert.strictEqual(a.name, ActivityEventNames.ContinueConversation)
  })

  it('Deserialize with empty name value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, name: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with name number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, name: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with code', () => {
    const obj = { type: ActivityTypes.CommandResult, code: EndOfConversationCodes.CompletedSuccessfully }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.code, 'completedSuccessfully')
    assert.strictEqual(a.code, EndOfConversationCodes.CompletedSuccessfully)
  })

  it('Deserialize with empty code value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, code: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with code number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, code: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with deliveryMode', () => {
    const obj = { type: ActivityTypes.CommandResult, deliveryMode: DeliveryModes.Normal }
    const a: Activity = Activity.fromObject(obj)
    assert.strictEqual(a.type, 'commandResult')
    assert.strictEqual(a.type, ActivityTypes.CommandResult)
    assert.strictEqual(a.deliveryMode, 'normal')
    assert.strictEqual(a.deliveryMode, DeliveryModes.Normal)
  })

  it('Deserialize with empty deliveryMode value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, deliveryMode: '' }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })

  it('Deserialize with deliveryMode number value throws', () => {
    const obj = { type: ActivityTypes.CommandResult, deliveryMode: 123 }
    assert.throws(() => {
      const a: Activity = Activity.fromObject(obj)
    }, ZodError)
  })
})

describe('Activities from Emulator', () => {
  it('Fix Timestamps', () => {
    const json = `{
        "type": "conversationUpdate",
        "membersAdded": [
          {
            "id": "28be1e20-a5d5-11ef-8fa6-db006ff0c234",
            "name": "Bot"
          },
          {
            "id": "ef4db06d-3b1a-4cea-aac8-7b460ce06196",
            "name": "User"
          }
        ],
        "membersRemoved": [],
        "channelId": "emulator",
        "conversation": {
          "id": "07ab9c10-a5dc-11ef-8fa6-db006ff0c234|livechat"
        },
        "id": "07b81f30-a5dc-11ef-ab05-65c5fcef7d53",
        "localTimestamp": "2024-11-18T10:36:31-08:00",
        "recipient": {
          "id": "28be1e20-a5d5-11ef-8fa6-db006ff0c234",
          "name": "Bot",
          "role": "bot"
        },
        "timestamp": "2024-11-18T18:36:31.267Z",
        "from": {
          "id": "ef4db06d-3b1a-4cea-aac8-7b460ce06196",
          "name": "User",
          "role": "user"
        },
        "locale": "en-US",
        "serviceUrl": "http://localhost:59297"
      }`

    const activity: Activity = Activity.fromJson(json)
    assert.strictEqual(activity.type, 'conversationUpdate')
    assert.deepStrictEqual(activity.localTimestamp?.toString(), new Date('2024-11-18T10:36:31-08:00').toString())
  })
})

describe('Activity getConversationReference', () => {
  it('should throw an error if recipient is null', () => {
    const obj = {
      type: ActivityTypes.Message,
      recipient: {
        id: 'id'
      }
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.recipient = null
    assert.throws(() => activity.getConversationReference(), /Activity Recipient undefined/)
  })

  it('should throw an error if conversation is null', () => {
    const obj = {
      type: ActivityTypes.Message,
      conversation: {
        id: 'id'
      },
      recipient: { id: 'bot1', name: 'Bot' },
      channelId: 'channel123',
      serviceUrl: 'http://example.com'
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.conversation = null
    assert.throws(() => activity.getConversationReference(), /Activity Conversation undefined/)
  })

  it('should throw an error if channelId is null', () => {
    const obj = {
      type: ActivityTypes.Message,
      channelId: 'channelId',
      serviceUrl: 'http://example.com',
      recipient: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' }
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.channelId = null
    assert.throws(() => activity.getConversationReference(), /Activity ChannelId undefined/)
  })

  it('should throw an error if serviceUrl is null', () => {
    const obj = {
      type: ActivityTypes.Message,
      serviceUrl: 'serviceUrl',
      recipient: { id: 'bot1', name: 'Bot' },
      channelId: 'channel123',
      conversation: { id: 'conversation1' }
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.serviceUrl = null
    assert.throws(() => activity.getConversationReference(), /Activity ServiceUrl undefined/)
  })

  it('should return a valid ConversationReference', () => {
    const obj = {
      type: ActivityTypes.Message,
      id: 'activity123',
      from: { id: 'user1', name: 'User' },
      recipient: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'channel123',
      locale: 'en-US',
      serviceUrl: 'http://example.com'
    }
    const activity: Activity = Activity.fromObject(obj)
    const conversationReference = activity.getConversationReference()

    const expected: ConversationReference = {
      activityId: 'activity123',
      user: { id: 'user1', name: 'User' },
      bot: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'channel123',
      locale: 'en-US',
      serviceUrl: 'http://example.com'
    }

    assert.deepEqual(conversationReference, expected)
  })
})

describe('Activity applyConversationReference', () => {
  it('should apply reference values for isIncoming false', () => {
    const obj = {
      type: ActivityTypes.Message,
      locale: undefined,
      id: 'activity123'
    }
    const activity: Activity = Activity.fromObject(obj)
    const reference: ConversationReference = {
      activityId: 'refActivityId',
      user: { id: 'user1', name: 'User' },
      bot: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'channel123',
      locale: 'en-US',
      serviceUrl: 'http://example.com'
    }

    const result = activity.applyConversationReference(reference, false)

    assert.deepEqual(result, {
      type: 'message',
      locale: 'en-US',
      id: 'activity123',
      channelId: 'channel123',
      serviceUrl: 'http://example.com',
      conversation: { id: 'conversation1' },
      from: { id: 'bot1', name: 'Bot' },
      recipient: { id: 'user1', name: 'User' },
      replyToId: 'refActivityId'
    })
  })

  it('should apply reference values for isIncoming true', () => {
    const obj = {
      type: ActivityTypes.Message,
      id: 'activity123',
      locale: undefined
    }
    const activity: Activity = Activity.fromObject(obj)
    const reference: ConversationReference = {
      activityId: 'refActivityId',
      user: { id: 'user1', name: 'User' },
      bot: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'channel123',
      locale: 'en-US',
      serviceUrl: 'http://example.com'
    }

    const result = activity.applyConversationReference(reference, true)

    assert.deepEqual(result, {
      type: 'message',
      id: 'refActivityId',
      locale: 'en-US',
      channelId: 'channel123',
      serviceUrl: 'http://example.com',
      conversation: { id: 'conversation1' },
      from: { id: 'user1', name: 'User' },
      recipient: { id: 'bot1', name: 'Bot' }
    })
  })
})

describe('Activity removeRecipientMention', () => {
  it('should remove the mention text when the recipient ID matches', () => {
    const mention: Mention = {
      mentioned: { id: 'bot1', name: 'Bot' },
      text: 'bot123',
      type: 'mention'
    }
    const obj = {
      type: ActivityTypes.Message,
      entities: [mention],
      recipient: { id: 'bot1', name: 'Bot' },
      text: 'bot123 Hello, how can I help you?'
    }
    const activity: Activity = Activity.fromObject(obj)
    activity.entities = [mention as unknown as Entity]

    const result = activity.removeRecipientMention()
    assert.equal(result, 'Hello, how can I help you?')
  })

  it('should return an empty string if recipient is null', () => {
    const mention: Mention = {
      mentioned: { id: 'bot1', name: 'Bot' },
      text: 'bot123',
      type: 'mention'
    }
    const obj = {
      type: ActivityTypes.Message,
      entities: [mention as unknown as Entity],
      recipient: {
        id: 'id'
      },
      text: 'bot123 Hello, how can I help you?'
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.recipient = null
    const result = activity.removeRecipientMention()
    assert.equal(result, '')
  })

  it('should return an empty string if recipient has no ID', () => {
    const mention: Mention = {
      mentioned: { id: 'bot1', name: 'Bot' },
      text: 'bot123',
      type: 'mention'
    }
    const obj = {
      type: ActivityTypes.Message,
      entities: [mention as unknown as Entity],
      recipient: {
        id: 'id'
      },
      text: 'bot123 Hello, how can I help you?'
    }
    const activity: Activity = Activity.fromObject(obj)
    // @ts-expect-error
    activity.recipient = { id: null }
    const result = activity.removeRecipientMention()
    assert.equal(result, '')
  })

  it('should handle text without mention', () => {
    const obj = {
      type: ActivityTypes.Message,
      entities: [],
      recipient: { id: 'bot1', name: 'Bot' },
      text: 'Hello, how can I help you?'
    }
    const activity: Activity = Activity.fromObject(obj)
    const result = activity.removeRecipientMention()
    assert.equal(result, 'Hello, how can I help you?')
  })
})

describe('Activity getReplyConversationReference', () => {
  it('should return a ConversationReference with the correct activityId from the reply', () => {
    const obj = {
      type: ActivityTypes.Message,
      from: { id: 'user1', name: 'User' },
      recipient: { id: 'bot123', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'testChannel',
      serviceUrl: 'http://test.service.url'
    }
    const activity: Activity = Activity.fromObject(obj)
    const result = activity.getReplyConversationReference('reply123')

    assert.deepEqual(result, {
      activityId: 'reply123',
      user: { id: 'user1', name: 'User' },
      bot: { id: 'bot123', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'testChannel',
      serviceUrl: 'http://test.service.url',
      locale: undefined
    })
  })
})

describe('Activity from MCS', () => {
  it('should deserialize an MCS activity', () => {
    const obj = {
      type: 'message',
      id: 'eb9df230-2daa-4920-980d-e1bef52c5bfd',
      localTimestamp: '2025-01-16T17:18:45.196-08:00',
      localTimezone: 'America/Los_Angeles',
      serviceUrl: 'https://directline.botframework.com/',
      channelId: 'pva-studio',
      from: {
        id: 'c7292dba-1513-42bc-9ba8-4d686b21aad7',
        aadObjectId: 'c7292dba-1513-42bc-9ba8-4d686b21aad7',
        role: 'user'
      },
      conversation: { id: '637f239b-2ac2-4cb4-8dd1-04d63184de69' },
      recipient: {
        id: '127b164e-50eb-e1f3-9e9e-a3b54a865c16/d304c999-e0d2-ef11-8ee9-000d3a3b8fcb',
        name: 'cr0d1_myTestAgent',
        role: 'skill'
      },
      textFormat: 'plain',
      membersAdded: [],
      membersRemoved: [],
      reactionsAdded: [],
      reactionsRemoved: [],
      locale: 'en-US',
      text: 'echo bla',
      attachments: [],
      entities: [],
      channelData: {
        attachmentSizes: [],
        enableDiagnostics: true,
        testMode: 'Text',
        clientActivityID: 'q8ijtnyqh3'
      },
      relatesTo: {
        activityId: 'eb9df230-2daa-4920-980d-e1bef52c5bfd',
        conversation: { id: '637f239b-2ac2-4cb4-8dd1-04d63184de69' },
        channelId: 'pva-studio',
        locale: 'en-US'
      },
      deliveryMode: 'expectReplies',
      listenFor: [],
      textHighlights: []
    }
    const activity: Activity = Activity.fromObject(obj)
    assert.equal(activity.type, 'message')
    assert.strictEqual(activity.relatesTo?.serviceUrl, undefined)
  })
})
