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
import { decode } from 'jsonwebtoken'
import type { Connections } from '../auth/connections'
import { AgentApplication } from './agentApplication'
import { describeImage, imageHints, isServiceImage } from './m365InlineImage'
import { getHttpsUrl } from '../utils/outboundUrl'
import { createOutboundHostValidator, OutboundUrlPolicy } from '../outboundHostValidator'
import { AttachmentDownloadHttpClient } from './attachmentDownloadHttpClient'

const logger = debug('agents:M365AttachmentDownloader')

const fileInfoType = 'application/vnd.microsoft.teams.file.download.info'

/**
 * Gets a Graph token for the current agentic user.
 *
 * @param context The turn context for the current conversation.
 * @param origin The origin URL used to request the Graph token.
 * @returns The graph token for the current agentic user, or undefined if it cannot be obtained.
 */
async function graphToken (context: TurnContext, origin: string): Promise<string | undefined> {
  const activity = context.activity
  const tenant = activity.getAgenticTenantId()
  const instance = activity.getAgenticInstanceId()
  const user = activity.getAgenticUser()
  const conversationType = activity.conversation?.conversationType ?? 'personal'

  if (activity.recipient?.role?.toLowerCase() !== 'agenticuser' ||
      !tenant?.trim() || !instance?.trim() || !user?.trim() ||
      !['personal', 'groupChat', 'channel'].includes(conversationType)) {
    return undefined
  }

  const connections = context.turnState.get<Connections>(AgentApplication.ConnectionsKey) ??
    (context.adapter as { connectionManager?: Connections }).connectionManager
  const provider = connections?.getTokenProviderFromActivity(context.identity, activity)
  const token = await provider?.getAgenticUserToken(tenant, instance, user, [origin + '/.default'])

  if (!token) {
    return undefined
  }

  // Graph authorizes the request. Skip an unnecessary download when readable claims lack a file grant.
  const claims = decode(token)

  if (claims && typeof claims === 'object') {
    const scopes = typeof claims.scp === 'string' ? claims.scp.split(/\s+/) : []
    const roles = Array.isArray(claims.roles) ? claims.roles : []

    if (![...scopes, ...roles].some(value => typeof value === 'string' && /^(files|sites)\./i.test(value))) {
      logger.warn('Skipping shared file because the Graph token lacks file or site permissions.')
      return undefined
    }
  }
  return token
}

/**
 * Downloads signed files, pasted Teams images, and files shared with agentic users.
 * The download URL and attachment type determine which turn credential is used.
 */
export class M365AttachmentDownloader<TState extends TurnState = TurnState> implements InputFileDownloader<TState> {
  private readonly downloads: AttachmentDownloadHttpClient
  private readonly _stateKey: string
  private readonly graphBaseUrl?: URL

  /**
   * Creates an attachment downloader.
   *
   * @param stateKey - Turn-state key used by {@link downloadAndStoreFiles}.
   * @param outboundHostValidator - Policy used to validate attachment download URLs.
   * @param graphBaseUrl - Graph HTTPS endpoint including its API version.
   */
  public constructor (
    stateKey: string = 'inputFiles',
    outboundHostValidator?: OutboundUrlPolicy,
    graphBaseUrl = 'https://graph.microsoft.com/v1.0'
  ) {
    this.downloads = new AttachmentDownloadHttpClient(
      new HttpClient(),
      outboundHostValidator ?? createOutboundHostValidator()
    )
    this.graphBaseUrl = getHttpsUrl(graphBaseUrl)
    this._stateKey = stateKey
  }

  /**
   * Download any files relative to the current user's input.
   *
   * @param {TurnContext} context Context for the current turn of conversation.
   * @returns {Promise<InputFile[]>} Promise that resolves to an array of downloaded input files.
   */
  public async downloadFiles (context: TurnContext): Promise<InputFile[]> {
    if (context.activity.channelId !== Channels.Msteams && context.activity.channelId !== Channels.M365Copilot) {
      return []
    }
    const attachments = context.activity.attachments ?? []
    const hints = imageHints(attachments)
    let graphCredential: Promise<string | undefined> | undefined
    const getGraphToken = (origin: string) => (graphCredential ??= graphToken(context, origin))
    const files: InputFile[] = []
    for (const attachment of attachments) {
      if (!attachment.contentType || attachment.contentType.toLowerCase().startsWith('text/html')) {
        continue
      }
      try {
        const file = await this.downloadFile(attachment, context, hints, getGraphToken)
        if (file) {
          files.push(file)
        }
      } catch (error) {
        logger.warn('Attachment download failed.', { errorType: error instanceof Error ? error.name : 'unknown' })
      }
    }
    return files
  }

  private async downloadFile (
    attachment: Attachment,
    context: TurnContext,
    hints: Map<string, string>,
    getGraphToken: (origin: string) => Promise<string | undefined>
  ): Promise<InputFile | undefined> {
    const { content, contentUrl, name: filename } = attachment
    const contentType = attachment.contentType.toLowerCase()
    const url = getHttpsUrl(contentUrl)
    let target = url
    let authorization: string | undefined
    let imageId: string | undefined
    let redirects: 'https' | 'same-origin-bearer' = 'https'

    if (content && typeof content === 'object' && 'downloadUrl' in content) {
      target = typeof content.downloadUrl === 'string' ? getHttpsUrl(content.downloadUrl) : undefined
    } else if (contentType === fileInfoType) {
      const graph = this.graphBaseUrl

      if (!contentUrl || !url || !filename?.trim() || !content || typeof content !== 'object' || Array.isArray(content) ||
          !graph || graph.search || graph.hash) {
        return undefined
      }
      const token = await getGraphToken(graph.origin)

      if (!token) {
        return undefined
      }
      const share = Buffer.from(contentUrl).toString('base64url')
      target = new URL(graph.href.replace(/\/$/, '') + '/shares/u!' + share + '/driveItem/content')
      authorization = 'Bearer ' + token
      redirects = 'same-origin-bearer'
    } else if (url) {
      if (context.activity.channelId === Channels.Msteams && contentType.startsWith('image/')) {
        imageId = url.pathname.match(/\/v3\/attachments\/([\w.-]+)\/views\/original$/i)?.[1]

        if (imageId && !isServiceImage(url, context.activity.serviceUrl)) {
          return undefined
        }
      }
      const connector = context.turnState.get<ConnectorClient>(context.adapter.ConnectorClientKey)
      authorization = new Headers(connector?.httpClient.defaultHeaders).get('authorization') ?? undefined

      if (imageId) {
        if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
          return undefined
        }
        redirects = 'same-origin-bearer'
      }
    } else if (Buffer.isBuffer(content) || content instanceof ArrayBuffer) {
      const bytes = Buffer.from(new Uint8Array(content))
      return { content: bytes, contentType: attachment.contentType, contentUrl, filename }
    }

    if (!target) {
      return undefined
    }

    const response = await this.downloads.get(target.href, authorization ? { Authorization: authorization } : {}, redirects)

    if (!response) {
      return undefined
    }
    const bytes = Buffer.from(response.data)

    if (imageId) {
      return { content: bytes, contentUrl, ...describeImage(bytes, imageId, hints.get(imageId) ?? contentType) }
    }

    return {
      content: bytes,
      contentType: response.headers.get('content-type') ?? (contentType === fileInfoType ? 'application/octet-stream' : attachment.contentType),
      contentUrl,
      filename
    }
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
