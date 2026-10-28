/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/** A value accepted in a hierarchical configuration document. */
export type ConfigurationDocumentValue =
  | string
  | number
  | boolean
  | readonly ConfigurationDocumentValue[]
  | ConfigurationDocument

/** Provider-neutral hierarchical configuration data. */
export interface ConfigurationDocument {
  readonly [key: string]: ConfigurationDocumentValue
}

/** Values returned by a pluggable configuration source. */
export type ConfigurationSourceResult =
  | Readonly<Record<string, string>>
  | {
    /** Canonical Agents SDK paths with raw string values. */
    readonly format: 'canonical'
    readonly values: Readonly<Record<string, string>>
  }
  | {
    /** A hierarchical document using the shared Agents SDK schema. */
    readonly format: 'document'
    readonly value: Readonly<ConfigurationDocument>
  }

/**
 * Supplies canonical or hierarchical configuration values.
 *
 * @remarks
 * Sources are loaded asynchronously by {@link createConfigurationContext} or
 * {@link preloadConfigurationSources}. Values are cached in an immutable
 * host-scoped or process-level snapshot so existing synchronous hosting APIs
 * can consume them during startup.
 */
export interface ConfigurationSource {
  /**
   * A unique name used to identify the source in diagnostics.
   */
  readonly name: string

  /**
   * Loads configuration data. A bare canonical record remains supported for
   * compatibility; new sources should identify their representation explicitly.
   */
  load(): Promise<ConfigurationSourceResult>
}

/**
 * Selects how an external source participates in configuration resolution.
 */
export type ConfigurationSourceMode =
  | 'fallback'
  | 'overrideEnvironment'
  | 'enforce'

/**
 * Registers a configuration source with an explicit resolution mode.
 */
export interface ConfigurationSourceRegistration {
  /**
   * The source to preload.
   */
  readonly source: ConfigurationSource

  /**
   * The source's resolution mode.
   */
  readonly mode: ConfigurationSourceMode
}
