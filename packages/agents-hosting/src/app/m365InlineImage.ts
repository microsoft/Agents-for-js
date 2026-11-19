// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Attachment } from '@microsoft/agents-activity'
import { getHttpsUrl } from '../utils/outboundUrl'
import type { InputFile } from './inputFileDownloader'

/**
 * Determines if a given URL points to a service image.
 *
 * @param url The URL of the image to check.
 * @param serviceUrl The base URL of the service to compare against.
 * @returns True if the URL points to a service image, false otherwise.
 */
export function isServiceImage (url: URL, serviceUrl?: string): boolean {
  const service = getHttpsUrl(serviceUrl)
  return service !== undefined && url.origin === service.origin &&
    url.pathname.startsWith(service.pathname.replace(/\/$/, '') + '/') &&
    !/%(?:2f|5c|25)/i.test(url.pathname)
}

/**
 * Supplies format hints for inline images found in the given attachments.
 *
 * @param attachments The list of attachments to extract image hints from.
 * @returns A map of image item IDs to their corresponding format hints.
 */
export function imageHints (attachments: Attachment[]): Map<string, string> {
  const hints = new Map<string, string>()

  for (const attachment of attachments) {
    if (!attachment.contentType?.toLowerCase().startsWith('text/html') || typeof attachment.content !== 'string') {
      continue
    }

    for (const [tag] of attachment.content.slice(0, 65536).matchAll(/<img\b[^<>]{1,2048}>/gi)) {
      const attrs = new Map<string, string>()

      for (const [, name, doubleQuoted, singleQuoted] of tag.matchAll(/\s+([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs.set(name.toLowerCase(), doubleQuoted ?? singleQuoted)
      }

      const id = attrs.get('itemid')
      const format = attrs.get('itemscope')

      if (id && format && attrs.get('itemtype') === 'http://schema.skype.com/AMSImage') {
        hints.set(id, format)
      }
    }
  }
  return hints
}

/**
 * Describes an inline image based on its content and format hint.
 *
 * @param content The binary content of the image.
 * @param id The identifier for the image.
 * @param hint The format hint for the image (e.g., 'image/png').
 * @returns An object containing the content type and filename for the image.
 */
export function describeImage (content: Buffer, id: string, hint: string): Pick<InputFile, 'contentType' | 'filename'> {
  let format = hint.toLowerCase().split(';')[0].replace(/^image\//, '')

  if (content.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
    format = 'png'
  } else if (content.subarray(0, 3).toString('hex') === 'ffd8ff') {
    format = 'jpeg'
  } else if (/^GIF8[79]a$/.test(content.toString('latin1', 0, 6))) {
    format = 'gif'
  } else if (content.toString('latin1', 0, 4) === 'RIFF' && content.toString('latin1', 8, 12) === 'WEBP') {
    format = 'webp'
  }

  if (format === 'jpg') {
    format = 'jpeg'
  }

  if (!['png', 'gif', 'jpeg', 'webp'].includes(format)) {
    return { contentType: 'application/octet-stream', filename: 'image-' + id }
  }

  return { contentType: 'image/' + format, filename: 'image-' + id + '.' + (format === 'jpeg' ? 'jpg' : format) }
}
