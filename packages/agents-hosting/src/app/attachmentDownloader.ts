/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios, { AxiosInstance } from 'axios'
import { InputFile, InputFileDownloader } from './inputFileDownloader'
import { TurnState } from './turnState'
import { TurnContext } from '../turnContext'
import { Attachment } from '@microsoft/agents-activity'
import { AuthProvider } from '../auth/authProvider'
import { debug } from '@microsoft/agents-activity/logger'
import { loadAuthConfigFromEnv, MsalTokenProvider } from '../auth'

const logger = debug('agents:attachmentDownloader')

/**
 * A utility class for downloading input files from activity attachments.
 *
 * @typeParam TState - The type of the turn state used in the application.
 *
 * @remarks
 * This class provides functionality to filter and download attachments from a turn context,
 * supporting various content types and handling authentication for secure URLs.
 *
 */
export class AttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private _httpClient: AxiosInstance

  /**
   * Creates an instance of AttachmentDownloader.
   * This class is responsible for downloading input files from attachments.
   */
  public constructor () {
    this._httpClient = axios.create()
  }

  /**
   * Downloads files from the attachments in the current turn context.
   *
   * @param context The turn context containing the activity with attachments.
   * @param state The turn state for the current conversation.
   * @returns A promise that resolves to an array of downloaded input files.
   */
  public async downloadFiles (context: TurnContext, state: TState): Promise<InputFile[]> {
    const attachments = context.activity.attachments?.filter((a) => !a.contentType.startsWith('text/html'))
    if (!attachments || attachments.length === 0) {
      logger.info('No Attachments to download')
      return Promise.resolve([])
    }

    // TODO: from adapter
    const authProvider: AuthProvider = new MsalTokenProvider()

    const accessToken = await authProvider.getAccessToken(loadAuthConfigFromEnv(), 'https://api.botframework.com')

    const files: InputFile[] = []
    for (const attachment of attachments) {
      const file = await this.downloadFile(attachment, accessToken)
      if (file) {
        files.push(file)
      }
    }

    logger.info('Attachments downloaded')
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
