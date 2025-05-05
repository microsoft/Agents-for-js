/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for resolving and transforming paths.
 * Implementations of this interface define how specific path patterns
 * should be transformed into other formats or namespaces.
 */
export interface PathResolver {
  /**
   * Transforms the given path into a new format or namespace.
   *
   * @param path - The path to inspect and transform.
   * @returns The transformed path.
   */
  transformPath(path: string): string;
}
