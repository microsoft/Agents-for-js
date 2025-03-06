/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios, { AxiosInstance } from 'axios'
import { InputFile, InputFileDownloader } from './inputFileDownloader'
import { TurnState } from './turnState'
import { TurnContext } from '../turnContext'
import { Attachment } from '@microsoft/agents-bot-activity'

export class AttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private _httpClient: AxiosInstance

  public constructor () {
    this._httpClient = axios.create()
  }

  public async downloadFiles (context: TurnContext, state: TState): Promise<InputFile[]> {
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

  private async downloadFile (attachment: Attachment, accessToken: string): Promise<InputFile | undefined> {
    if (
      (attachment.contentUrl && attachment.contentUrl.startsWith('https://')) ||
            (attachment.contentUrl && attachment.contentUrl.startsWith('http://localhost'))
    ) {
      let headers
      if (accessToken.length > 0) {
        headers = {
          Authorization: `Bearer ${accessToken}`
        }
      }
      const response = await this._httpClient.get(attachment.contentUrl, {
        headers,
        responseType: 'arraybuffer'
      })

      const content = Buffer.from(response.data, 'binary')

      let contentType = attachment.contentType
      if (contentType === 'image/*') {
        contentType = 'image/png'
      }

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
