/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import { parseBooleanEnv, suggestClosest } from '../utils/env'
import {
  ConfigurationDocument,
  ConfigurationSourceMode,
  ConfigurationSourceRegistration,
  ConfigurationSourceResult
} from './configurationSource'

export type AuthConnectionPatch = Record<string, unknown>
export type AuthConnectionMapPatch = Partial<{
  serviceUrl: string
  audience: string
  connection: string
}>
export type CloudAdapterConfigurationPatch = Partial<{
  emitStackTrace: boolean
  validateServiceUrl: boolean
}>
export type OutboundHostValidatorConfigurationPatch = Partial<{
  enabled: boolean
  includeDefaultMicrosoftHosts: boolean
  hosts: readonly string[]
}>
export type AuthorizationHandlerPatch = Record<string, unknown>

export interface ConfigurationLayer {
  readonly connections: ReadonlyMap<string, Readonly<{
    id: string
    settings: Readonly<AuthConnectionPatch>
  }>>
  readonly connectionsMap: ReadonlyMap<number, Readonly<AuthConnectionMapPatch>>
  readonly cloudAdapterOptions: Readonly<CloudAdapterConfigurationPatch>
  readonly outboundHostValidator: Readonly<OutboundHostValidatorConfigurationPatch>
  readonly agentApplication: Readonly<{
    userAuthorization: Readonly<{
      handlers: ReadonlyMap<string, Readonly<{
        id: string
        settings: Readonly<AuthorizationHandlerPatch>
      }>>
    }>
  }>
}

type ConfigurationSnapshot = Readonly<Record<ConfigurationSourceMode, ConfigurationLayer>>
type ConfigurationInputFormat = ConfigurationSourceResult['format'] | 'environment'

type ConfigurationState =
  | { kind: 'uninitialized' }
  | { kind: 'loading' }
  | { kind: 'ready', snapshot: ConfigurationSnapshot }
  | { kind: 'consumed', snapshot: ConfigurationSnapshot }

const modes: readonly ConfigurationSourceMode[] = ['fallback', 'overrideEnvironment', 'enforce']

const authParsers = {
  authType: asString,
  tenantId: asString,
  clientId: asString,
  clientSecret: asString,
  certPemFile: asString,
  certKeyFile: asString,
  connectionName: asString,
  federatedClientId: asString,
  authorityEndpoint: asString,
  scopes: asList,
  altBlueprintConnectionName: asString,
  WIDAssertionFile: asString,
  federatedTokenFile: asString,
  idpmResource: asString,
  azureRegion: asString,
  sendX5C: asBoolean,
  msalRetryCount: asNonNegativeInteger,
  sidecarBaseUrl: asString,
  serviceName: asString,
  blueprintServiceName: asString,
  bypassLocalNetworkRestriction: asBoolean,
  // Superset field: the JavaScript millisecond form parses here. A document
  // string is the .NET-only TimeSpan form and is rejected by
  // dotNetOnlyTimeSpanSettings below, not by this parser.
  requestTimeout: asPositiveInteger,
  retryCount: asNonNegativeInteger,
  issuers: asList,
  validateIssuer: asBoolean
} satisfies Record<string, (value: string) => unknown>

const cloudAdapterParsers = {
  emitStackTrace: asBoolean,
  validateServiceUrl: asBoolean
} satisfies Record<string, (value: string) => unknown>

const connectionMapParsers = {
  serviceUrl: asString,
  audience: asString,
  connection: asString
} satisfies Record<string, (value: string) => unknown>

const outboundHostValidatorParsers = {
  enabled: asBoolean,
  includeDefaultMicrosoftHosts: asBoolean,
  hosts: asList
} satisfies Record<string, (value: string) => unknown>

const authorizationParsers = {
  type: asString,
  azureBotOAuthConnectionName: asString,
  title: asString,
  text: asString,
  invalidSignInRetryMessage: asString,
  invalidSignInRetryMessageFormat: asString,
  invalidSignInRetryMaxExceededMessage: asString,
  oboConnectionName: asString,
  enableSso: asBoolean,
  invalidSignInRetryMax: asInteger,
  oboScopes: asList,
  altBlueprintConnectionName: asString,
  scopes: asList
} satisfies Record<string, (value: string) => unknown>

const authPropertyAliases: Readonly<Record<string, string>> = {
  alternateblueprintconnectionname: 'altBlueprintConnectionName',
  ficclientid: 'federatedClientId',
  authority: 'authorityEndpoint',
  scope: 'scopes'
} as const

const authorizationPropertyAliases: Readonly<Record<string, string>> = {
  alternateblueprintconnectionname: 'altBlueprintConnectionName'
} as const

const dotNetOnlyConnectionSettings = new Set([
  'certificatethumbprint',
  'certificatesubjectname',
  'certificatestorelocation',
  'certificatestorename',
  'validcertificateonly'
])

const dotNetOnlyAuthorizationSettings = new Set([
  'cancelsignincommands',
  'endoninvalidmessage',
  'showsigninlink',
  'signincancelledmessage',
  'teamssignininprogressmessage',
  'timeout'
])

// Connection settings that are a JS/.NET superset: JavaScript accepts the
// positive-integer millisecond form, while a document string is the
// .NET-only TimeSpan representation and is rejected as unsupported rather
// than as a generic invalid value. Canonical (environment) string values are
// unaffected, since every canonical value is a string regardless of runtime.
const dotNetOnlyTimeSpanSettings = new Set([
  'requesttimeout'
])

let state: ConfigurationState = { kind: 'uninitialized' }
const contextSnapshots = new WeakMap<ConfigurationContext, ConfigurationSnapshot>()
let instantiateConfigurationContext: () => ConfigurationContext

/**
 * An immutable, host-scoped set of resolved external configuration sources.
 *
 * @remarks
 * Create instances with {@link createConfigurationContext}. The context is
 * intentionally opaque; consumers pass it through their named options.
 */
export class ConfigurationContext {
  private readonly configurationContextBrand: undefined

  private constructor () {
    this.configurationContextBrand = undefined
  }

  static {
    instantiateConfigurationContext = () => new ConfigurationContext()
  }
}

function asString (value: string): string {
  return value
}

function asBoolean (value: string): boolean | undefined {
  return parseBooleanEnv(value)
}

function asInteger (value: string): number | undefined {
  const normalized = value.trim()
  if (!/^-?\d+$/.test(normalized)) {
    return undefined
  }
  const parsed = Number.parseInt(normalized, 10)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function asNonNegativeInteger (value: string): number | undefined {
  const parsed = asInteger(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

function asPositiveInteger (value: string): number | undefined {
  const parsed = asInteger(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function asList (value: string): string[] {
  return value.includes(',')
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : value.split(/\s+/).filter(Boolean)
}

export function createConfigurationLayer (): ConfigurationLayer {
  return {
    connections: new Map(),
    connectionsMap: new Map(),
    cloudAdapterOptions: {},
    outboundHostValidator: {},
    agentApplication: {
      userAuthorization: {
        handlers: new Map()
      }
    }
  }
}

function emptySnapshot (): ConfigurationSnapshot {
  return Object.freeze({
    fallback: freezeConfigurationLayer(createConfigurationLayer()),
    overrideEnvironment: freezeConfigurationLayer(createConfigurationLayer()),
    enforce: freezeConfigurationLayer(createConfigurationLayer())
  })
}

export function freezeConfigurationLayer (layer: ConfigurationLayer): ConfigurationLayer {
  return Object.freeze({
    connections: new Map([...layer.connections].map(([lookup, connection]) => [
      lookup,
      Object.freeze({
        id: connection.id,
        settings: freezeRecord(connection.settings)
      })
    ])),
    connectionsMap: new Map([...layer.connectionsMap].map(([index, item]) => [
      index,
      Object.freeze({ ...item })
    ])),
    cloudAdapterOptions: Object.freeze({ ...layer.cloudAdapterOptions }),
    outboundHostValidator: Object.freeze({
      ...layer.outboundHostValidator,
      ...(layer.outboundHostValidator.hosts === undefined
        ? {}
        : { hosts: Object.freeze([...layer.outboundHostValidator.hosts]) })
    }),
    agentApplication: Object.freeze({
      userAuthorization: Object.freeze({
        handlers: new Map([...layer.agentApplication.userAuthorization.handlers].map(([lookup, handler]) => [
          lookup,
          Object.freeze({ id: handler.id, settings: freezeRecord(handler.settings) })
        ]))
      })
    })
  })
}

export function mergeConfigurationLayers (
  ...layers: readonly ConfigurationLayer[]
): ConfigurationLayer {
  const merged = createConfigurationLayer()

  for (const layer of layers) {
    for (const connection of layer.connections.values()) {
      const lookup = connection.id.toLowerCase()
      const current = merged.connections.get(lookup)
      ;(merged.connections as Map<string, { id: string, settings: AuthConnectionPatch }>).set(
        lookup,
        {
          id: current?.id ?? connection.id,
          settings: {
            ...current?.settings,
            ...connection.settings
          }
        }
      )
    }
    for (const [index, item] of layer.connectionsMap) {
      ;(merged.connectionsMap as Map<number, AuthConnectionMapPatch>).set(index, {
        ...merged.connectionsMap.get(index),
        ...item
      })
    }
    Object.assign(merged.cloudAdapterOptions, layer.cloudAdapterOptions)
    Object.assign(merged.outboundHostValidator, layer.outboundHostValidator)

    const mergedHandlers = merged.agentApplication.userAuthorization.handlers
    for (const handler of layer.agentApplication.userAuthorization.handlers.values()) {
      const lookup = handler.id.toLowerCase()
      const current = mergedHandlers.get(lookup)
      ;(mergedHandlers as Map<string, { id: string, settings: AuthorizationHandlerPatch }>).set(
        lookup,
        {
          id: current?.id ?? handler.id,
          settings: {
            ...current?.settings,
            ...handler.settings
          }
        }
      )
    }
  }

  return freezeConfigurationLayer(merged)
}

function freezeRecord<T extends Record<string, unknown>> (record: T): Readonly<T> {
  return Object.freeze(Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      Array.isArray(value) ? Object.freeze([...value]) : value
    ])
  )) as Readonly<T>
}

const canonicalRoots = [
  'connections',
  'connectionsMap',
  'cloudAdapterOptions',
  'outboundHostValidator',
  'agentApplication'
] as const

/**
 * Suggests a canonical path by correcting only fixed schema segments.
 * Dynamic connection/handler IDs and route indexes are preserved verbatim.
 */
export function suggestConfigurationPath (path: string): string | undefined {
  const parts = path.split('.')
  const root = findCanonicalSegment(parts[0], canonicalRoots)
  if (!root) {
    return undefined
  }

  let suggested: string[] | undefined
  if (parts.length === 1) {
    suggested = [root]
  } else if (root === 'connections' && parts.length === 3) {
    const settings = findCanonicalSegment(parts[2], ['settings'])
    if (settings) {
      suggested = [root, parts[1], settings]
    }
  } else if (root === 'connections' && parts.length >= 4) {
    const settingsIndex = parts.length - 2
    const settings = findCanonicalSegment(parts[settingsIndex], ['settings'])
    const property = findCanonicalProperty(parts.at(-1) ?? '', authParsers, authPropertyAliases)
    if (settings && property && settingsIndex > 1) {
      suggested = [root, ...parts.slice(1, settingsIndex), settings, property]
    }
  } else if (root === 'connectionsMap' && parts.length === 3 && /^\d+$/.test(parts[1])) {
    const property = findCanonicalProperty(parts[2], connectionMapParsers)
    if (property) {
      suggested = [root, parts[1], property]
    }
  } else if (root === 'cloudAdapterOptions' && parts.length === 2) {
    const property = findCanonicalProperty(parts[1], cloudAdapterParsers)
    if (property) {
      suggested = [root, property]
    }
  } else if (root === 'outboundHostValidator' && parts.length === 2) {
    const property = findCanonicalProperty(parts[1], outboundHostValidatorParsers)
    if (property) {
      suggested = [root, property]
    }
  } else if (root === 'agentApplication' && parts.length === 2) {
    const userAuthorization = findCanonicalSegment(parts[1], ['userAuthorization'])
    if (userAuthorization) {
      suggested = [root, userAuthorization]
    }
  } else if (root === 'agentApplication' && parts.length === 3) {
    const userAuthorization = findCanonicalSegment(parts[1], ['userAuthorization'])
    const handlers = findCanonicalSegment(parts[2], ['handlers'])
    if (userAuthorization && handlers) {
      suggested = [root, userAuthorization, handlers]
    }
  } else if (root === 'agentApplication' && parts.length === 5) {
    const userAuthorization = findCanonicalSegment(parts[1], ['userAuthorization'])
    const handlers = findCanonicalSegment(parts[2], ['handlers'])
    const settings = findCanonicalSegment(parts[4], ['settings'])
    if (userAuthorization && handlers && settings) {
      suggested = [root, userAuthorization, handlers, parts[3], settings]
    }
  } else if (root === 'agentApplication' && parts.length >= 6) {
    const settingsIndex = parts.length - 2
    const userAuthorization = findCanonicalSegment(parts[1], ['userAuthorization'])
    const handlers = findCanonicalSegment(parts[2], ['handlers'])
    const settings = findCanonicalSegment(parts[settingsIndex], ['settings'])
    const property = findCanonicalProperty(
      parts.at(-1) ?? '',
      authorizationParsers,
      authorizationPropertyAliases
    )
    if (userAuthorization && handlers && settings && property && settingsIndex > 3) {
      suggested = [
        root,
        userAuthorization,
        handlers,
        ...parts.slice(3, settingsIndex),
        settings,
        property
      ]
    }
  }

  const result = suggested?.join('.')
  return result && result.toLowerCase() !== path.toLowerCase() ? result : undefined
}

function findCanonicalSegment (
  value: string | undefined,
  candidates: readonly string[]
): string | undefined {
  if (!value) {
    return undefined
  }
  return candidates.find(candidate => candidate.toLowerCase() === value.toLowerCase()) ??
    suggestClosest(value, candidates, 4)
}

function findCanonicalProperty (
  value: string,
  parsers: Readonly<Record<string, (value: string) => unknown>>,
  aliases: Readonly<Record<string, string>> = {}
): string | undefined {
  const alias = aliases[value.toLowerCase()]
  return alias ??
    findCanonicalSegment(value, Object.keys(parsers))
}

function invalidConfigurationPath (path: string, sourceName: string): Error {
  const suggestion = suggestConfigurationPath(path)
  const definition = suggestion
    ? {
        ...Errors.InvalidConfigurationPath,
        description: `${Errors.InvalidConfigurationPath.description} Did you mean \`${suggestion}\`?`
      }
    : Errors.InvalidConfigurationPath
  return ExceptionHelper.generateException(Error, definition, undefined, { path, sourceName })
}

function parseValue (
  parsers: Record<string, (value: string) => unknown>,
  property: string,
  value: unknown,
  path: string,
  sourceName: string,
  format: ConfigurationInputFormat,
  aliases: Readonly<Record<string, string>> = {},
  allowExtension = false
): { key: string, value: unknown } {
  const lookup = property.toLowerCase()
  const aliasedKey = format === 'canonical' ? undefined : aliases[lookup]
  const key = aliasedKey ??
    Object.keys(parsers).find(candidate => candidate.toLowerCase() === lookup)
  if (!key) {
    if (format === 'canonical' && aliases[lookup]) {
      throw invalidConfigurationPath(path, sourceName)
    }
    if (allowExtension) {
      validateDynamicSegment(property, path, sourceName)
      const extensionValue = format === 'document'
        ? parseExtensionValue(value)
        : typeof value === 'string' ? value : undefined
      if (extensionValue !== undefined) {
        return { key: property, value: extensionValue }
      }
      throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, { path, sourceName })
    }
    throw invalidConfigurationPath(path, sourceName)
  }

  const parser = parsers[key]
  const parsed = format === 'document'
    ? parseDocumentValue(parser, value)
    : typeof value === 'string' ? parser(value) : undefined
  if (parsed === undefined) {
    if (format === 'document' && typeof value === 'string' && dotNetOnlyTimeSpanSettings.has(lookup)) {
      unsupportedRuntimeField(path, sourceName)
    }
    throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, { path, sourceName })
  }

  function parseDocumentValue (
    parser: (value: string) => unknown,
    value: unknown
  ): unknown {
    if (parser === asString) {
      return typeof value === 'string' ? value : undefined
    }
    if (parser === asBoolean) {
      return typeof value === 'boolean' ? value : undefined
    }
    if (parser === asInteger) {
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
    }
    if (parser === asNonNegativeInteger) {
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
    }
    if (parser === asPositiveInteger) {
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
    }
    if (parser === asList) {
      return Array.isArray(value) &&
        value.every(item => typeof item === 'string' && item.trim().length > 0)
        ? [...value]
        : undefined
    }
    return undefined
  }
  return { key, value: parsed }
}

function parseExtensionValue (value: unknown): unknown {
  if (typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isSafeInteger(value))) {
    return value
  }
  if (Array.isArray(value) &&
    value.every(item => typeof item === 'string' && item.trim().length > 0)) {
    return [...value]
  }
  return undefined
}

function validateDynamicSegment (segment: string, path: string, sourceName: string): void {
  if (['__proto__', 'constructor', 'prototype'].includes(segment.toLowerCase())) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidConfigurationPath, undefined, { path, sourceName })
  }
}

export function setConfigurationValue (
  target: ConfigurationLayer,
  path: string,
  rawValue: unknown,
  sourceName: string,
  format: ConfigurationInputFormat
): void {
  const parts = path.split('.')
  const authConnectionMatch = /^connections\.(.+)\.settings\.([^.]+)$/.exec(path)
  if (authConnectionMatch) {
    const [, id, property] = authConnectionMatch
    validateDynamicSegment(id, path, sourceName)
    const parsed = parseValue(
      authParsers,
      property,
      rawValue,
      path,
      sourceName,
      format,
      authPropertyAliases,
      true
    )
    const lookup = id.toLowerCase()
    const current = target.connections.get(lookup) ?? { id, settings: {} }
    ;(current.settings as AuthConnectionPatch)[parsed.key] = parsed.value
    ;(target.connections as Map<string, { id: string, settings: AuthConnectionPatch }>).set(lookup, current)
    return
  }

  if (parts.length === 3 && parts[0] === 'connectionsMap' && /^\d+$/.test(parts[1])) {
    const index = Number.parseInt(parts[1], 10)
    const parsed = parseValue(connectionMapParsers, parts[2], rawValue, path, sourceName, format)
    const current = { ...(target.connectionsMap.get(index) ?? {}) }
    current[parsed.key as keyof AuthConnectionMapPatch] = parsed.value as string
    ;(target.connectionsMap as Map<number, AuthConnectionMapPatch>).set(index, current)
    return
  }

  if (parts.length === 2 && parts[0] === 'cloudAdapterOptions') {
    const parsed = parseValue(cloudAdapterParsers, parts[1], rawValue, path, sourceName, format)
    ;(target.cloudAdapterOptions as CloudAdapterConfigurationPatch)[parsed.key as keyof CloudAdapterConfigurationPatch] = parsed.value as boolean
    return
  }

  if (parts.length === 2 && parts[0] === 'outboundHostValidator') {
    const parsed = parseValue(outboundHostValidatorParsers, parts[1], rawValue, path, sourceName, format)
    if (parsed.key === 'hosts') {
      ;(target.outboundHostValidator as OutboundHostValidatorConfigurationPatch).hosts = parsed.value as string[]
    } else {
      ;(target.outboundHostValidator as OutboundHostValidatorConfigurationPatch)[parsed.key as 'enabled' | 'includeDefaultMicrosoftHosts'] = parsed.value as boolean
    }
    return
  }

  const authorizationHandlerMatch = /^agentApplication\.userAuthorization\.handlers\.(.+)\.settings\.([^.]+)$/.exec(path)
  if (authorizationHandlerMatch) {
    const [, id, property] = authorizationHandlerMatch
    validateDynamicSegment(id, path, sourceName)
    const parsed = parseValue(
      authorizationParsers,
      property,
      rawValue,
      path,
      sourceName,
      format,
      authorizationPropertyAliases,
      true
    )
    const lookup = id.toLowerCase()
    const handlers = target.agentApplication.userAuthorization.handlers
    const current = handlers.get(lookup) ?? { id, settings: {} }
    ;(current.settings as AuthorizationHandlerPatch)[parsed.key] = parsed.value
    ;(handlers as Map<string, { id: string, settings: AuthorizationHandlerPatch }>).set(lookup, current)
    return
  }

  throw invalidConfigurationPath(path, sourceName)
}

export function isConfigurationInputError (error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === Errors.InvalidConfigurationPath.code ||
    code === Errors.InvalidConfigurationValue.code ||
    code === Errors.UnsupportedRuntimeConfigurationField.code
}

function asDocumentObject (
  value: unknown,
  path: string,
  sourceName: string
): Readonly<ConfigurationDocument> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, { path, sourceName })
  }
  return value as Readonly<ConfigurationDocument>
}

function uniqueEntries (
  value: Readonly<ConfigurationDocument>,
  path: string,
  sourceName: string
): Array<[string, ConfigurationDocument[keyof ConfigurationDocument]]> {
  const normalized = new Set<string>()
  return Object.entries(value).map(([key, entryValue]) => {
    const lookup = key.toLowerCase()
    if (normalized.has(lookup)) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidConfigurationPath, undefined, {
        path: path ? `${path}.${key}` : key,
        sourceName
      })
    }
    normalized.add(lookup)
    return [key, entryValue]
  })
}

function unsupportedRuntimeField (path: string, sourceName: string): never {
  throw ExceptionHelper.generateException(
    Error,
    Errors.UnsupportedRuntimeConfigurationField,
    undefined,
    { path, sourceName }
  )
}

function compileDocument (
  target: ConfigurationLayer,
  document: Readonly<ConfigurationDocument>,
  sourceName: string
): void {
  for (const [section, sectionValue] of uniqueEntries(document, '', sourceName)) {
    switch (section.toLowerCase()) {
      case 'connections':
        compileDocumentConnections(target, sectionValue, section, sourceName)
        break
      case 'connectionsmap':
        compileDocumentConnectionsMap(target, sectionValue, section, sourceName)
        break
      case 'cloudadapteroptions':
        compileDocumentLeafObject(target, sectionValue, section, sourceName, 'cloudAdapterOptions')
        break
      case 'outboundhostvalidator':
        compileDocumentLeafObject(target, sectionValue, section, sourceName, 'outboundHostValidator')
        break
      case 'agentapplication':
        compileDocumentAgentApplication(target, sectionValue, section, sourceName)
        break
      default:
        // Shared appsettings files may contain unrelated host configuration.
        if (suggestConfigurationPath(section)) {
          throw invalidConfigurationPath(section, sourceName)
        }
        break
    }
  }
}

function compileDocumentConnections (
  target: ConfigurationLayer,
  value: unknown,
  path: string,
  sourceName: string
): void {
  const connections = asDocumentObject(value, path, sourceName)
  for (const [id, definitionValue] of uniqueEntries(connections, path, sourceName)) {
    validateDynamicSegment(id, `${path}.${id}`, sourceName)
    const definition = asDocumentObject(definitionValue, `${path}.${id}`, sourceName)
    let settingsFound = false
    for (const [key, entryValue] of uniqueEntries(definition, `${path}.${id}`, sourceName)) {
      const entryPath = `${path}.${id}.${key}`
      if (key.toLowerCase() === 'settings') {
        settingsFound = true
        compileDocumentLeafObject(target, entryValue, entryPath, sourceName, `connections.${id}.settings`)
      } else if (key.toLowerCase() === 'assembly' || key.toLowerCase() === 'type') {
        unsupportedRuntimeField(entryPath, sourceName)
      } else {
        throw invalidConfigurationPath(entryPath, sourceName)
      }
    }
    if (!settingsFound) {
      throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, {
        path: `${path}.${id}.settings`,
        sourceName
      })
    }
  }
}

function compileDocumentConnectionsMap (
  target: ConfigurationLayer,
  value: unknown,
  path: string,
  sourceName: string
): void {
  if (!Array.isArray(value)) {
    throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, { path, sourceName })
  }
  value.forEach((item, index) => {
    compileDocumentLeafObject(
      target,
      item,
      `${path}.${index}`,
      sourceName,
      `connectionsMap.${index}`
    )
  })
}

function compileDocumentAgentApplication (
  target: ConfigurationLayer,
  value: unknown,
  path: string,
  sourceName: string
): void {
  const application = asDocumentObject(value, path, sourceName)
  for (const [key, entryValue] of uniqueEntries(application, path, sourceName)) {
    const entryPath = `${path}.${key}`
    if (key.toLowerCase() !== 'userauthorization') {
      if (suggestConfigurationPath(entryPath)) {
        throw invalidConfigurationPath(entryPath, sourceName)
      }
      continue
    }
    const authorization = asDocumentObject(entryValue, entryPath, sourceName)
    for (const [authorizationKey, authorizationValue] of uniqueEntries(authorization, entryPath, sourceName)) {
      const authorizationPath = `${entryPath}.${authorizationKey}`
      if (authorizationKey.toLowerCase() === 'handlers') {
        compileDocumentAuthorizationHandlers(target, authorizationValue, authorizationPath, sourceName)
      } else if (suggestConfigurationPath(authorizationPath)) {
        throw invalidConfigurationPath(authorizationPath, sourceName)
      } else {
        unsupportedRuntimeField(authorizationPath, sourceName)
      }
    }
  }
}

function compileDocumentAuthorizationHandlers (
  target: ConfigurationLayer,
  value: unknown,
  path: string,
  sourceName: string
): void {
  const handlers = asDocumentObject(value, path, sourceName)
  for (const [id, definitionValue] of uniqueEntries(handlers, path, sourceName)) {
    validateDynamicSegment(id, `${path}.${id}`, sourceName)
    const definition = asDocumentObject(definitionValue, `${path}.${id}`, sourceName)
    let settingsFound = false
    for (const [key, entryValue] of uniqueEntries(definition, `${path}.${id}`, sourceName)) {
      const entryPath = `${path}.${id}.${key}`
      if (key.toLowerCase() === 'settings') {
        settingsFound = true
        compileDocumentLeafObject(
          target,
          entryValue,
          entryPath,
          sourceName,
          `agentApplication.userAuthorization.handlers.${id}.settings`
        )
      } else if (key.toLowerCase() === 'assembly' || key.toLowerCase() === 'type') {
        unsupportedRuntimeField(entryPath, sourceName)
      } else {
        throw invalidConfigurationPath(entryPath, sourceName)
      }
    }
    if (!settingsFound) {
      throw ExceptionHelper.generateException(TypeError, Errors.InvalidConfigurationValue, undefined, {
        path: `${path}.${id}.settings`,
        sourceName
      })
    }
  }
}

function compileDocumentLeafObject (
  target: ConfigurationLayer,
  value: unknown,
  path: string,
  sourceName: string,
  canonicalPrefix: string
): void {
  const record = asDocumentObject(value, path, sourceName)
  const normalizedProperties = new Set<string>()
  for (const [key, entryValue] of uniqueEntries(record, path, sourceName)) {
    const lookup = key.toLowerCase()
    if (canonicalPrefix.startsWith('connections.') && dotNetOnlyConnectionSettings.has(lookup)) {
      unsupportedRuntimeField(`${path}.${key}`, sourceName)
    }
    if (canonicalPrefix.startsWith('agentApplication.userAuthorization.handlers.') &&
      dotNetOnlyAuthorizationSettings.has(lookup)) {
      unsupportedRuntimeField(`${path}.${key}`, sourceName)
    }
    const normalizedProperty = canonicalPrefix.startsWith('connections.')
      ? authPropertyAliases[lookup] ?? lookup
      : canonicalPrefix.startsWith('agentApplication.userAuthorization.handlers.')
        ? authorizationPropertyAliases[lookup] ?? lookup
        : lookup
    const normalizedLookup = normalizedProperty.toLowerCase()
    if (normalizedProperties.has(normalizedLookup)) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidConfigurationPath, undefined, {
        path: `${path}.${key}`,
        sourceName
      })
    }
    normalizedProperties.add(normalizedLookup)
    setConfigurationValue(target, `${canonicalPrefix}.${key}`, entryValue, sourceName, 'document')
  }
}

function compileSourceResult (
  target: ConfigurationLayer,
  result: ConfigurationSourceResult,
  sourceName: string
): void {
  if (
    result !== null &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    !('format' in result) &&
    Object.values(result).every(value => typeof value === 'string')
  ) {
    compileCanonicalEntries(target, Object.entries(result), sourceName)
    return
  }
  if (result?.format === 'canonical' && result.values !== null && typeof result.values === 'object' && !Array.isArray(result.values)) {
    compileCanonicalEntries(target, Object.entries(result.values), sourceName)
    return
  }
  if (result?.format === 'document' && result.value !== null && typeof result.value === 'object' && !Array.isArray(result.value)) {
    compileDocument(target, result.value, sourceName)
    return
  }
  throw ExceptionHelper.generateException(Error, Errors.InvalidConfigurationSourceResult, undefined, { sourceName })
}

function compileCanonicalEntries (
  target: ConfigurationLayer,
  entries: readonly (readonly [string, string])[],
  sourceName: string
): void {
  const destinations = new Set<string>()
  for (const [path, value] of entries) {
    const destination = normalizeCanonicalDestination(path)
    if (destinations.has(destination)) {
      const definition = {
        ...Errors.InvalidConfigurationPath,
        description: 'Configuration source `{sourceName}` returned duplicate canonical destination `{path}`.'
      }
      throw ExceptionHelper.generateException(Error, definition, undefined, { path, sourceName })
    }
    destinations.add(destination)
    setConfigurationValue(target, path, value, sourceName, 'canonical')
  }
}

function normalizeCanonicalDestination (path: string): string {
  const parts = path.split('.').map(part => part.toLowerCase())
  if (parts[0] === 'connectionsmap' && /^\d+$/.test(parts[1] ?? '')) {
    parts[1] = Number.parseInt(parts[1], 10).toString()
  }
  return parts.join('.')
}

async function loadConfigurationSnapshot (
  registrations: readonly ConfigurationSourceRegistration[]
): Promise<ConfigurationSnapshot> {
  const names = new Set<string>()
  for (const { source, mode } of registrations) {
    if (!source.name.trim()) {
      throw ExceptionHelper.generateException(Error, Errors.ConfigurationSourceNameRequired)
    }
    if (!modes.includes(mode)) {
      throw ExceptionHelper.generateException(
        Error,
        Errors.InvalidConfigurationSourceMode,
        undefined,
        { sourceName: source.name, mode: String(mode) }
      )
    }
    if (names.has(source.name)) {
      throw ExceptionHelper.generateException(Error, Errors.DuplicateConfigurationSource, undefined, { sourceName: source.name })
    }
    names.add(source.name)
  }

  const loaded = await Promise.all(registrations.map(async registration => {
    try {
      return {
        ...registration,
        result: await registration.source.load()
      }
    } catch {
      throw ExceptionHelper.generateException(Error, Errors.ConfigurationSourceLoadFailed, undefined, { sourceName: registration.source.name })
    }
  }))

  const mutable = Object.fromEntries(
    modes.map(mode => [mode, createConfigurationLayer()])
  ) as Record<ConfigurationSourceMode, ConfigurationLayer>
  for (const { source, mode, result } of loaded) {
    compileSourceResult(mutable[mode], result, source.name)
  }

  return Object.freeze(Object.fromEntries(
    modes.map(mode => [mode, freezeConfigurationLayer(mutable[mode])])
  )) as ConfigurationSnapshot
}

/**
 * Loads configuration sources into a new immutable, host-scoped context.
 *
 * @param registrations Configuration sources and their explicit resolution modes.
 * @returns A context that can be shared by consumers belonging to one host.
 */
export async function createConfigurationContext (
  registrations: readonly ConfigurationSourceRegistration[]
): Promise<ConfigurationContext> {
  const snapshot = await loadConfigurationSnapshot(registrations)
  const context = Object.freeze(instantiateConfigurationContext()) as ConfigurationContext
  contextSnapshots.set(context, snapshot)
  return context
}

/**
 * Preloads external configuration sources into an immutable process-level snapshot.
 *
 * @remarks
 * Call this function once, before constructing configuration consumers such as
 * `CloudAdapter` or `AgentApplication`. Sources in the same mode are applied in
 * registration order, with later values winning.
 *
 * @param registrations Configuration sources and their explicit resolution modes.
 */
export async function preloadConfigurationSources (
  registrations: readonly ConfigurationSourceRegistration[]
): Promise<void> {
  if (state.kind === 'loading') {
    throw ExceptionHelper.generateException(Error, Errors.ConfigurationPreloadInProgress)
  }
  if (state.kind === 'ready') {
    throw ExceptionHelper.generateException(Error, Errors.ConfigurationAlreadyPreloaded)
  }
  if (state.kind === 'consumed') {
    throw ExceptionHelper.generateException(Error, Errors.ConfigurationAlreadyConsumed)
  }

  state = { kind: 'loading' }
  try {
    state = {
      kind: 'ready',
      snapshot: await loadConfigurationSnapshot(registrations)
    }
  } catch (cause) {
    state = { kind: 'uninitialized' }
    throw cause
  }
}

export function getConfigurationSnapshot (context?: ConfigurationContext): ConfigurationSnapshot {
  if (context) {
    const snapshot = contextSnapshots.get(context)
    if (!snapshot) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidConfigurationContext)
    }
    return snapshot
  }
  if (state.kind === 'loading') {
    throw ExceptionHelper.generateException(Error, Errors.ConfigurationPreloadInProgress)
  }
  if (state.kind === 'uninitialized') {
    const snapshot = emptySnapshot()
    state = { kind: 'consumed', snapshot }
    return snapshot
  }
  if (state.kind === 'ready') {
    state = { kind: 'consumed', snapshot: state.snapshot }
    return state.snapshot
  }
  return state.snapshot
}

export function resetConfigurationSourcesForTest (): void {
  state = { kind: 'uninitialized' }
}
