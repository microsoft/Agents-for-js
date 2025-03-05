/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios, { AxiosInstance } from 'axios'
import { InputFile, InputFileDownloader } from './inputFileDownloader'
import { TurnState } from './turnState'
import { TurnContext } from '../turnContext'
import { Attachment } from '@microsoft/agents-bot-activity'

/**
 * Downloads attachments.
 */
export class AttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private _httpClient: AxiosInstance

  public constructor () {
    this._httpClient = axios.create()
  }

  /**
     * Download any files relative to the current user's input.
     * @template TState - Type of the state object passed to the `TurnContext.turnState` method.
     * @param {TurnContext} context Context for the current turn of conversation.
     * @param {TState} state Application state for the current turn of conversation.
     * @returns {Promise<InputFile[]>} Promise that resolves to an array of downloaded input files.
     */
  public async downloadFiles (context: TurnContext, state: TState): Promise<InputFile[]> {
    // Filter out HTML attachments
    const attachments = context.activity.attachments?.filter((a) => !a.contentType.startsWith('text/html'))
    if (!attachments || attachments.length === 0) {
      return Promise.resolve([])
    }

    const accessToken = ''

    const files: InputFile[] = []
    for (const attachment of attachments) {
      const file = await this.downloadFile(attachment, accessToken)
      if (file) {
        files.push(file)
      }
    }

    return files
  }

  /**
     * @private
     * @param {Attachment} attachment - Attachment to download.
     * @param {string} accessToken - Access token to use for downloading.
     * @returns {Promise<InputFile>} - Promise that resolves to the downloaded input file.
     */
  private async downloadFile (attachment: Attachment, accessToken: string): Promise<InputFile | undefined> {
    if (
      (attachment.contentUrl && attachment.contentUrl.startsWith('https://')) ||
            (attachment.contentUrl && attachment.contentUrl.startsWith('http://localhost'))
    ) {
      let headers
      if (accessToken.length > 0) {
        // Build request for downloading file if access token is available
        headers = {
          Authorization: `Bearer ${accessToken}`
        }
      }
      const response = await this._httpClient.get(attachment.contentUrl, {
        headers,
        responseType: 'arraybuffer'
      })

      // Convert to a buffer
      const content = Buffer.from(response.data, 'binary')

      // Fixup content type
      let contentType = attachment.contentType
      if (contentType === 'image/*') {
        contentType = 'image/png'
      }

      // Return file
      return {
        content,
        contentType,
        contentUrl: attachment.contentUrl
      }
    } else {
      return {
        content: Buffer.from(attachment.content as any),
        contentType: attachment.contentType,
        contentUrl: attachment.contentUrl
      }
    }
  }
}
