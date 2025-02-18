// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, CardFactory, MessageFactory, TurnContext } from '@microsoft/agents-bot-hosting'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { ActionTypes, Activity, ActivityTypes, Attachment, ConversationReference, EndOfConversationCodes } from '@microsoft/agents-bot-activity'

export class MultiFeatureBot extends ActivityHandler {
  conversationReferences: { [key: string]: ConversationReference }
  constructor (conversationReferences: { [key: string]: ConversationReference }) {
    super()
    this.conversationReferences = conversationReferences

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded
      if (membersAdded != null) {
        for (let cnt = 0; cnt < membersAdded.length; cnt++) {
          if ((context.activity.recipient != null) && membersAdded[cnt].id !== context.activity.recipient.id) {
            // If the Activity is a ConversationUpdate, send a greeting message to the user.
            await context.sendActivity('Welcome to the Multi Feature sample!')
            await context.sendActivity('For attachments, if you send "Display Attachment options" you would see the options. You can also send me an attachment and I will save it, and alternatively, I can send you an attachment.')
            await context.sendActivity('You can also send "wait" and watch me typing, or send "end" or "stop" to finish the conversation.')
            await context.sendActivity('Navigate to http://<your-bot-server>/api/notify to proactively message everyone who has previously messaged this bot. Remember to add an Authorization header with your Bearer token')

            // By calling next() you ensure that the next BotHandler is run.
            await next()
          }
        }
      }
    })

    this.onMessage(async (context, next) => {
      this.addConversationReference(context.activity)

      if (context.activity.text !== undefined) {
        switch (context.activity.text.toLowerCase()) {
          case 'end':
          case 'stop':
            await context.sendActivity(Activity.fromObject(
              {
                type: ActivityTypes.EndOfConversation,
                code: EndOfConversationCodes.CompletedSuccessfully
              }
            )
            )
            break
          case 'wait':
            await context.sendActivities([
              Activity.fromObject({ type: ActivityTypes.Typing }),
              Activity.fromObject({ type: 'delay', value: 3000 }),
              Activity.fromObject({ type: ActivityTypes.Message, text: 'Finished typing' })
            ])
            break
          case 'display attachment options':
            await this.displayAttachmentOptions(context)
            break
          case '1':
          case '2':
            // Since no attachment was received, send an attachment to the user.
            await this.handleOutgoingAttachment(context)
            // Send a HeroCard with potential options for the user to select.
            await this.displayAttachmentOptions(context)
            break
          default:
            await context.sendActivity(MessageFactory.text('Your input was not recognized, please try again.'))
        }
      } else {
        if ((context.activity.attachments != null) && context.activity.attachments.length > 0) {
          const validAttachments = context.activity.attachments.filter((a: { contentType: string }) => a.contentType !== 'text/html')
          if (validAttachments.length > 0) {
            // The user sent an attachment and the bot should handle the incoming attachment.
            await this.handleIncomingAttachment(context, validAttachments)
          } else {
            const reply: Activity = new Activity(ActivityTypes.Message)
            reply.text = 'Invalid attachment, please try again.'
            await context.sendActivity(reply)
          }
        }
      }

      // By calling next() you ensure that the next BotHandler is run.
      await next()
    })

    this.onReactionsAdded(async (context) => {
      await Promise.all((context.activity.reactionsAdded ?? []).map(async (reaction: { type: any }) => {
        if (context.activity.replyToId !== undefined) {
          const newReaction = `You reacted with '${reaction.type}' to the following message: '${context.activity.replyToId}'`
          await context.sendActivity(newReaction)
        }
      }))
    })

    this.onReactionsRemoved(async (context) => {
      await Promise.all((context.activity.reactionsRemoved ?? []).map(async (reaction: { type: any }) => {
        if (context.activity.replyToId !== undefined) {
          const newReaction = `You removed the reaction '${reaction.type}' from the message: '${context.activity.replyToId}'`
          await context.sendActivity(newReaction)
        }
      }))
    })

    this.onInstallationUpdateAdd(async (context, next) => {
      const installationText = 'Hi I\'m the multi feature demo bot. This message is being sent because I was installed'
      if (context.activity.conversation?.conversationType !== undefined && context.activity.conversation.conversationType !== 'personal') {
        if (context.activity.conversation.conversationType === 'channel') {
          const channelName: string = (context.activity.channelData as { team: { name: string } }).team.name
          await context.sendActivity(MessageFactory.text(`${installationText} and configured in the ${channelName} channel`))
        } else {
          if (context.activity.conversation.conversationType === 'groupChat') {
            const groupChatName: string = context.activity.conversation.name ?? 'group chat'
            await context.sendActivity(MessageFactory.text(`${installationText} and configured in this group ${groupChatName}`))
          }
        }
      } else {
        await context.sendActivity(MessageFactory.text(`${installationText} here.`))
      }
      await next()
    })

    this.onInstallationUpdateRemove(async (context, next) => {
      if ((context.activity.conversation != null) && context.activity.conversation.conversationType !== 'personal') {
        return
      } else {
        await context.sendActivity(MessageFactory.text('You uninstalled the multi feature demo bot.'))
      }
      await next()
    })

    this.onEndOfConversation(async (context, next) => {
      // This will be called if the root bot is ending the conversation.  Sending additional messages should be
      // avoided as the conversation may have been deleted.
      // Perform cleanup of resources if needed.

      // By calling next() you ensure that the next BotHandler is run.
      await next()
    })

    this.onTyping(async (context, next) => {
      const typingMessageText = 'You are typing a message'
      await context.sendActivity(MessageFactory.text(typingMessageText))

      await next()
    })

    this.onMessageUpdate(async (context, next) => {
      const updatedMessageText = 'You updated the message'
      await context.sendActivity(MessageFactory.text(updatedMessageText))
      await next()
    })

    this.onConversationUpdate(async (context, next) => {
      this.addConversationReference(context.activity)

      const convMessageText = 'The conversation has been updated'
      await context.sendActivity(MessageFactory.text(convMessageText))
      await next()
    })

    this.onMessageDelete(async (context, next) => {
      const deletedMessageText = 'You deleted the message'
      await context.sendActivity(MessageFactory.text(deletedMessageText))
      await next()
    })
  }

  async handleIncomingAttachment (turnContext: TurnContext, validAttachments: Attachment[]): Promise<void> {
    if (turnContext.activity.attachments === undefined) {
      throw new Error('Invalid Activity Attachments: undefined')
    }
    const promises = validAttachments.map(async a => await this.downloadAttachmentAndWrite(a))
    const successfulSaves = await Promise.all(promises)

    async function replyForReceivedAttachments (localAttachmentData: {
      fileName: string
      localPath: string
    } | undefined): Promise<void> {
      if (localAttachmentData != null) {
        await turnContext.sendActivity(`Attachment "${localAttachmentData.fileName}" ` +
                `has been received and saved to "${localAttachmentData.localPath}".`)
      } else {
        await turnContext.sendActivity('Attachment was not successfully saved to disk.')
      }
    }

    const replyPromises = successfulSaves.map(replyForReceivedAttachments.bind(turnContext))
    await Promise.all(replyPromises)
  }

  async downloadAttachmentAndWrite (attachment: Attachment): Promise<{
    fileName: string
    localPath: string
  } | undefined> {
    // Retrieve the attachment via url.
    // Use content.downloadURL if available as that contains needed auth token for working with ms teams
    const attachmentContent = (attachment.content) as { downloadUrl: string }
    const url = attachmentContent.downloadUrl ?? attachment.contentUrl

    if (attachment.name === undefined) {
      throw new Error('Invalid Attachment name: undefined')
    }

    // Local file path for the bot to save the attachment.
    const localFileName = path.join(__dirname, attachment.name)

    try {
      // arraybuffer is necessary for images
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      // If user uploads JSON file, this prevents it from being written as "{"type":"Buffer","data":[123,13,10,32,32,34,108..."
      if (response.headers['content-type'] === 'application/json') {
        response.data = JSON.parse(response.data, (key, value) => {
          return value !== undefined && value.type === 'Buffer' ? Buffer.from(value.data) : value
        })
      }
      fs.writeFile(localFileName, response.data, (fsError) => {
        if (fsError != null) {
          throw fsError
        }
      })
    } catch (error) {
      console.error(error)
      return undefined
    }

    return {
      fileName: attachment.name,
      localPath: localFileName
    }
  }

  async handleOutgoingAttachment (turnContext: TurnContext): Promise<void> {
    const reply: Activity = new Activity(ActivityTypes.Message)

    if (turnContext.activity.text === undefined) {
      throw new Error('Invalid Activity Text: undefined')
    }

    // Look at the user input, and figure out what type of attachment to send.
    // If the input matches one of the available choices, populate reply with
    // the available attachments.
    // If the choice does not match with a valid choice, inform the user of
    // possible options.
    const firstChar = turnContext.activity.text[0]
    if (firstChar === '1') {
      reply.text = 'This is an inline attachment.'
      reply.attachments = [this.getInlineAttachment()]
    } else if (firstChar === '2') {
      reply.attachments = [this.getInternetAttachment()]
      reply.text = 'This is an internet attachment.'
    } else {
      // The user did not enter input that this bot was built to handle.
      reply.text = 'Your input was not recognized, please try again.'
    }
    await turnContext.sendActivity(reply)
  }

  async displayAttachmentOptions (turnContext: TurnContext): Promise<void> {
    const reply: Activity = new Activity(ActivityTypes.Message)

    // Note that some channels require different values to be used in order to get buttons to display text.
    // In this code the emulator is accounted for with the 'title' parameter, but in other channels you may
    // need to provide a value for other parameters like 'text' or 'displayText'.
    const buttons = [
      { type: ActionTypes.ImBack, title: '1. Inline Attachment', value: '1' },
      { type: ActionTypes.ImBack, title: '2. Internet Attachment', value: '2' }
    ]

    const card = CardFactory.heroCard('', undefined,
      buttons, { text: 'You can upload an image or select one of the following choices.' })

    reply.attachments = [card]

    await turnContext.sendActivity(reply)
  }

  getInlineAttachment (): Attachment {
    const imageData = fs.readFileSync(path.join(__dirname, '../resources/architecture-resize.png'))
    const base64Image = Buffer.from(imageData).toString('base64')

    return {
      name: 'architecture-resize.png',
      contentType: 'image/png',
      contentUrl: `data:image/png;base64,${base64Image}`
    }
  }

  getInternetAttachment (): Attachment {
    // NOTE: The contentUrl must be HTTPS.
    return {
      name: 'architecture-resize.png',
      contentType: 'image/png',
      contentUrl: 'https://docs.microsoft.com/en-us/bot-framework/media/how-it-works/architecture-resize.png'
    }
  }

  addConversationReference (activity: Activity): void {
    const newConversationReference = activity.getConversationReference()
    this.conversationReferences[newConversationReference.conversation.id] = newConversationReference
  }
}
