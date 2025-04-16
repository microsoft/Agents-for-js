const version = require('../../../package.json').version
const os = require('os')
export const getProductInfo = () : string => `agents-sdk-js/${version} nodejs/${process.version} ${os.platform()}-${os.arch()}/${os.release()}`
