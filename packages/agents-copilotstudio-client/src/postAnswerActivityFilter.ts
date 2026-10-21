/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Activity } from '@microsoft/agents-activity'

interface StreamMetadata {
  streamType: 'streaming' | 'informative' | 'final'
  streamId?: string
  streamSequence?: number
}

function getStreamMetadata (activity: Activity): StreamMetadata | undefined {
  // Match WebChat's activity schema order and metadata-carrier precedence.
  for (const streamType of ['streaming', 'informative', 'final'] as const) {
    if (streamType !== 'final' && activity.type !== 'typing') {
      continue
    }
    if (streamType === 'final' && activity.type === 'typing' && activity.text) {
      continue
    }
    const matches = (value: unknown): value is StreamMetadata => {
      if (!value || typeof value !== 'object') {
        return false
      }
      const metadata = value as StreamMetadata
      return metadata.streamType === streamType && (streamType === 'final'
        ? typeof metadata.streamId === 'string' && metadata.streamId.length > 0
        : (metadata.streamId === undefined || typeof metadata.streamId === 'string') &&
          Number.isInteger(metadata.streamSequence) && metadata.streamSequence! >= 1)
    }
    if (matches(activity.channelData)) {
      return activity.channelData
    }
    const entity = activity.entities?.find(entity => entity.type === 'streaminfo' && matches(entity))
    if (entity && matches(entity)) {
      return entity
    }
  }
}

/** Creates a filter for one service response, preserving content and visible progress. */
export function createPostAnswerActivityFilter (): (activity: Activity) => boolean {
  const answeredSenders = new Set<string>()
  const forwardedStreams = new Set<string>()
  const hiddenStreams = new Set<string>()

  return activity => {
    const sender = activity.from?.id
    if (!sender) {
      return true
    }
    const metadata = typeof activity.id === 'string' ? getStreamMetadata(activity) : undefined
    const key = metadata ? JSON.stringify([sender, metadata.streamId || activity.id]) : undefined
    if (activity.type === 'message' && (activity.text || activity.attachments?.length)) {
      answeredSenders.add(sender)
    }

    // Once WebChat has seen a stream, all of its updates must remain visible:
    // an empty chunk can intentionally erase a previously displayed partial answer.
    if (!key || forwardedStreams.has(key)) {
      return true
    }

    // Copilot Studio may continue sending empty orchestration thoughts after
    // delivering an answer. Forwarding these reopens WebChat's busy indicator.
    // Thoughts before an answer, progress text, cards, and subsequent answers
    // remain visible. The raw CopilotStudioClient stream is unchanged.
    const hasThought = activity.entities?.some(entity => entity.type === 'thought')
    const hasSchemaContent = activity.entities?.some(entity => entity.type?.startsWith('https://schema.org/'))
    if (answeredSenders.has(sender) && activity.type === 'typing' &&
      metadata?.streamType === 'streaming' && (hasThought || hiddenStreams.has(key)) &&
      !activity.text && !activity.attachments?.length && !hasSchemaContent) {
      hiddenStreams.add(key)
      return false
    }
    forwardedStreams.add(key)
    hiddenStreams.delete(key)
    return true
  }
}
