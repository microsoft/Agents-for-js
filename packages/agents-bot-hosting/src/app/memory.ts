/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Memory {
  deleteValue(path: string): void;

  hasValue(path: string): boolean;

  getValue<TValue = unknown>(path: string): TValue;

  setValue(path: string, value: unknown): void;
}
