import { GetTokenOptions, TokenCredential } from '@azure/core-auth'
import { AuthConfiguration, MsalTokenProvider } from './'

export class MsalTokenCredential implements TokenCredential {
  constructor (private authConfig: AuthConfiguration) {}
  public async getToken (scopes: string[], options?: GetTokenOptions) {
    const scope = scopes[0].substring(0, scopes[0].lastIndexOf('/'))
    const token = await new MsalTokenProvider().getAccessToken(this.authConfig, scope)
    return {
      token,
      expiresOnTimestamp: Date.now() + 10000
    }
  }
}
