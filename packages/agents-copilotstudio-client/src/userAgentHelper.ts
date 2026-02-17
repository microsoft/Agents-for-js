/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { version } from '../package.json'
import os from 'os'

/**
 * Utility class for generating user agent strings for Copilot Studio client requests.
 */
export class UserAgentHelper {
  /**
   * Generates a user agent string appropriate for the current environment.
   * - For browser environments, includes the browser's user agent.
   * - For Node.js environments, includes Node version, platform, architecture, and release.
   * @returns A user agent string for HTTP headers.
   */
  static getProductInfo (): string {
    const versionString = `CopilotStudioClient.agents-sdk-js/${version}`
    let userAgent: string

    if (typeof window !== 'undefined' && window.navigator) {
      // Browser environment
      userAgent = `${versionString} ${navigator.userAgent}`
    } else {
      // Node.js environment
      userAgent = `${versionString} nodejs/${process.version} ${os.platform()}-${os.arch()}/${os.release()}`
    }

    return userAgent
  }

  /**
   * Gets just the version string without environment details.
   * @returns The version string (e.g., "CopilotStudioClient.agents-sdk-js/0.1.0")
   */
  static getVersionString (): string {
    return `CopilotStudioClient.agents-sdk-js/${version}`
  }

  /**
   * Gets the SDK version number.
   * @returns The version number (e.g., "0.1.0")
   */
  static getVersion (): string {
    return version
  }
}
