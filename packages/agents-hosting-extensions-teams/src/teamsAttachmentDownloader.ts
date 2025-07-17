/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-activity'
import { ConnectorClient, InputFile, InputFileDownloader, TurnContext, TurnState } from '@microsoft/agents-hosting'
import axios, { AxiosInstance } from 'axios'
import { z } from 'zod'
/**
 * Downloads attachments from Teams using the bots access token.
 */
export class TeamsAttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private _httpClient: AxiosInstance
  public constructor () {
    this._httpClient = axios.create()
  }

  /**
     * Download any files relative to the current user's input.
     * @typeParam TState - Type of the state object passed to the `TurnContext.turnState` method.
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

    const connectorClient : ConnectorClient = context.turnState.get<ConnectorClient>('connectorClient')
    this._httpClient.defaults.headers = connectorClient.axiosInstance.defaults.headers

    const files: InputFile[] = []
    for (const attachment of attachments) {
      const file = await this.downloadFile(attachment)
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
  private async downloadFile (attachment: Attachment): Promise<InputFile | undefined> {
    let inputFile: InputFile | undefined
    if (attachment.contentType === 'application/vnd.microsoft.teams.file.download.info') {
      const contentSchema = z.object({ downloadUrl: z.string() })
      const contentValue = contentSchema.parse(attachment.content)
      const response = await this._httpClient.get(contentValue.downloadUrl, { responseType: 'arraybuffer' })
      const content = Buffer.from(response.data, 'binary')
      let contentType = attachment.contentType
      if (contentType === 'image/*') {
        contentType = 'image/png'
      }
      inputFile = { content, contentType, contentUrl: attachment.contentUrl }
    } else if (attachment.contentType === 'image/*') {
      const response = await this._httpClient.get(attachment.contentUrl!, { responseType: 'arraybuffer' })
      const content = Buffer.from(response.data, 'binary')
      inputFile = { content, contentType: attachment.contentType, contentUrl: attachment.contentUrl }
    } else {
      inputFile = {
        content: Buffer.from(attachment.content as ArrayBuffer),
        contentType: attachment.contentType,
        contentUrl: attachment.contentUrl
      }
    }
    return inputFile
  }
}
