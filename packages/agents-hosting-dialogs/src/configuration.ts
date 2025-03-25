// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Configuration is an interface that is used to obtain configurable values
 */
export interface Configuration {
  get<T = unknown>(path?: string[]): T | undefined;
  set(path: string[], value: unknown): void;
}

/**
 * Useful for shimming Components into ComponentRegistrations
 */
export const noOpConfiguration: Configuration = {
  get (_path) {
    return undefined
  },
  set (_path, _value) {
    // no-op
  },
}
