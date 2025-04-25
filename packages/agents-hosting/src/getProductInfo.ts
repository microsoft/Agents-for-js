import pjson from '@microsoft/agents-hosting/package.json'
import os from 'os'

/**
 * Generates a string containing information about the SDK version and runtime environment.
 * This is used for telemetry and User-Agent headers in HTTP requests.
 *
 * @returns A formatted string containing the SDK version, Node.js version, and OS details
 */
export const getProductInfo = () : string => `agents-sdk-js/${pjson.version} nodejs/${process.version} ${os.platform()}-${os.arch()}/${os.release()}`
