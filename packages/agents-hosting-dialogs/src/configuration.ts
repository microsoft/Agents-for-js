// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Configuration is an interface that is used to obtain configurable values
 */
export interface Configuration {
  /**
   * Gets a configured value at the specified path.
   *
   * @param path The path segments identifying the value.
   * @returns The configured value, or `undefined` when no value exists.
   */
  get<T = unknown>(path?: string[]): T | undefined;

  /**
   * Sets a configured value at the specified path.
   *
   * @param path The path segments identifying the value.
   * @param value The value to set.
   */
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
