/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment, Channels } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { ConnectorClient } from '../connector-client'
import { InputFile, InputFileDownloader } from './inputFileDownloader'
import { TurnContext } from '../turnContext'
import { TurnState } from './turnState'
import { HttpClient } from '../httpClient'
import { z } from 'zod'
import { createOutboundHostValidator, OutboundUrlPolicy } from '../outboundHostValidator'
import { AttachmentDownloadHttpClient } from './attachmentDownloadHttpClient'

const logger = debug('agents:M365AttachmentDownloader')

/**
 * Downloads attachments from Teams and M365 using the bots access token.
 * Enabled outbound validation requires HTTPS and validates addresses at every redirect.
 * Initial request credentials are not forwarded to redirects when validation is enabled.
 */
export class M365AttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private _httpClient: HttpClient
  private _stateKey: string
  private readonly _hostValidator: OutboundUrlPolicy

  /**
   * Creates an attachment downloader.
   *
   * @param stateKey - Turn-state key used by {@link downloadAndStoreFiles}.
   * @param outboundHostValidator - Policy used to validate attachment download URLs.
   */
  public constructor (stateKey: string = 'inputFiles', outboundHostValidator?: OutboundUrlPolicy) {
    this._httpClient = new HttpClient()
    this._stateKey = stateKey
    this._hostValidator = outboundHostValidator ?? createOutboundHostValidator()
  }

  /**
   * Download any files relative to the current user's input.
   *
   * @param {TurnContext} context Context for the current turn of conversation.
   * @returns {Promise<InputFile[]>} Promise that resolves to an array of downloaded input files.
   */
  public async downloadFiles (context: TurnContext): Promise<InputFile[]> {
    if (context.activity.channelId !== Channels.Msteams && context.activity.channelId !== Channels.M365Copilot) {
      return Promise.resolve([])
    }
    // Filter out HTML attachments
    const attachments = context.activity.attachments?.filter((a) => a.contentType && !a.contentType.startsWith('text/html'))
    if (!attachments || attachments.length === 0) {
      return Promise.resolve([])
    }

    const connectorClient : ConnectorClient = context.turnState.get<ConnectorClient>(context.adapter.ConnectorClientKey)
    const headers = { ...connectorClient.httpClient.defaultHeaders }

    const files: InputFile[] = []
    for (const attachment of attachments) {
      const file = await this.downloadFile(attachment, headers)
      if (file) {
        files.push(file)
      }
    }

    return files
  }

  /**
   * @private
   * @param {Attachment} attachment - Attachment to download.
   * @returns {Promise<InputFile>} - Promise that resolves to the downloaded input file.
   */
  private async downloadFile (attachment: Attachment, headers: Record<string, string> = {}): Promise<InputFile | undefined> {
    let inputFile: InputFile | undefined

    if (attachment.contentUrl && attachment.contentUrl.startsWith('https://')) {
      try {
        const contentSchema = z.object({ downloadUrl: z.string().url() })
        const parsed = contentSchema.safeParse(attachment.content)
        const downloadUrl = parsed.success ? parsed.data.downloadUrl : attachment.contentUrl
        const response = await new AttachmentDownloadHttpClient(this._httpClient, this._hostValidator)
          .get(downloadUrl, headers)
        if (!response) {
          return undefined
        }

        const content = Buffer.from(response.data as ArrayBuffer)
        const contentTypeHeader = response.headers.get('content-type')
        const contentType = typeof contentTypeHeader === 'string' ? contentTypeHeader : 'application/octet-stream'
        inputFile = { content, contentType, contentUrl: attachment.contentUrl }
      } catch (error) {
        const code = error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : 'unavailable'
        logger.error(`Failed to download Teams attachment. Error type='${error instanceof Error ? error.name : 'unknown'}', Code='${code}'`)
        return undefined
      }
    } else {
      if (!attachment.content) {
        logger.error('Attachment missing content')
        return undefined
      }
      if (!(attachment.content instanceof ArrayBuffer) && !Buffer.isBuffer(attachment.content)) {
        logger.error('Attachment content is not ArrayBuffer or Buffer')
        return undefined
      }
      inputFile = {
        content: Buffer.from(attachment.content as ArrayBuffer),
        contentType: attachment.contentType,
        contentUrl: attachment.contentUrl
      }
    }
    return inputFile
  }

  /**
   * Downloads files from the attachments in the current turn context and stores them in state.
   *
   * @param context The turn context containing the activity with attachments.
   * @param state The turn state to store the files in.
   * @returns A promise that resolves when the downloaded files are stored.
   */
  public async downloadAndStoreFiles (context: TurnContext, state: TState): Promise<void> {
    const files = await this.downloadFiles(context)
    state.setValue(this._stateKey, files)
  }
}

/**
 * @deprecated Use {@link M365AttachmentDownloader} from @microsoft/agents-hosting instead.
 */
export class TeamsAttachmentDownloader extends M365AttachmentDownloader {}
