import pjson from '@microsoft/agents-hosting/package.json'
import os from 'os'
export const getProductInfo = () : string => `agents-sdk-js/${pjson.version} nodejs/${process.version} ${os.platform()}-${os.arch()}/${os.release()}`
