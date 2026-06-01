// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

export const Errors = {
  PipeNotConnected: {
    code: -180000,
    description: 'Named pipe is not connected.'
  } satisfies AgentErrorDefinition,

  PipeConnectionFailed: {
    code: -180001,
    description: 'Failed to establish named pipe connection: {reason}'
  } satisfies AgentErrorDefinition,

  PipePayloadTooLarge: {
    code: -180002,
    description: 'Payload size {size} exceeds maximum allowed size of {max} bytes.'
  } satisfies AgentErrorDefinition,

  PipeRequestTimeout: {
    code: -180003,
    description: 'Named pipe request timed out after {timeout}ms.'
  } satisfies AgentErrorDefinition,

  PipeProtocolError: {
    code: -180004,
    description: 'Named pipe protocol error: {reason}'
  } satisfies AgentErrorDefinition,

  PipeWriteFailed: {
    code: -180005,
    description: 'Failed to write to named pipe: {reason}'
  } satisfies AgentErrorDefinition,

  PipeReadFailed: {
    code: -180006,
    description: 'Failed to read from named pipe: {reason}'
  } satisfies AgentErrorDefinition,

  PipeCancelledAll: {
    code: -180007,
    description: 'Peer cancelled all in-flight requests (CancelAll) — request {requestId}.'
  } satisfies AgentErrorDefinition,

  PipeHeaderInvalid: {
    code: -180008,
    description: 'Invalid named pipe header: {reason}'
  } satisfies AgentErrorDefinition,

  PipeOperationCancelled: {
    code: -180009,
    description: 'Named pipe operation was cancelled.'
  } satisfies AgentErrorDefinition,

  PipeNameInvalid: {
    code: -180010,
    description: 'Invalid named pipe name: {reason}'
  } satisfies AgentErrorDefinition,

  PipeServerStoppedBeforeConnecting: {
    code: -180012,
    description: 'Named pipe server stopped before connecting.'
  } satisfies AgentErrorDefinition,

  PipeSendQueueFull: {
    code: -180013,
    description: 'Named pipe send queue is full ({queued}/{limit}); activity was not accepted.'
  } satisfies AgentErrorDefinition,

  PipeStreamCancelled: {
    code: -180014,
    description: 'Peer cancelled stream {streamId}.'
  } satisfies AgentErrorDefinition,

  PipeResourceLimitExceeded: {
    code: -180015,
    description: 'Named pipe resource limit exceeded: {reason}'
  } satisfies AgentErrorDefinition,

  PipeOutboundSendTimeout: {
    code: -180016,
    description: 'Outbound send timed out after {timeout}ms.'
  } satisfies AgentErrorDefinition,

  PipeInvalidAttachmentId: {
    code: -180017,
    description: 'Attachment id {id} is not a valid 36-character GUID; the named pipe wire format truncates ids longer than 36 characters and the stream would never complete on the peer.'
  } satisfies AgentErrorDefinition,

  PipeTrailingStreamReadFailed: {
    code: -180018,
    description: 'Pipe closed while draining {missing} trailing bytes for stream {streamId}; framing would desynchronize. Tearing down the connection to force reconnect.'
  } satisfies AgentErrorDefinition,

  PipePlatformNotSupported: {
    code: -180019,
    description: 'Named pipe hosting is only supported on Windows; current platform is {platform}. Use a different transport (e.g. HTTP) on this platform.'
  } satisfies AgentErrorDefinition
}
