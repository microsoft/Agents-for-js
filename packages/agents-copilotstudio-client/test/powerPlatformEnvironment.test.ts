import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  getCopilotStudioConnectionUrl,
  getTokenAudience
} from '../src/powerPlatformEnvironment'
import { ConnectionSettings } from '../src/connectionSettings'
import { PowerPlatformCloud } from '../src/powerPlatformCloud'
import { AgentType } from '../src/agentType'

describe('PowerPlatformEnvironment', function () {
  const baseSettings: ConnectionSettings = {
    appClientId: 'test-client-id',
    tenantId: 'test-tenant-id',
    environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
    agentIdentifier: 'TestBot',
    cloud: PowerPlatformCloud.Prod,
    copilotAgentType: AgentType.Published,
    authority: 'https://login.microsoftonline.com'
  }

  describe('getCopilotStudioConnectionUrl', function () {
    it('should generate URL for production cloud with published agent', function () {
      const settings = { ...baseSettings }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('environment.api.powerplatform.com'))
      assert(url.includes('conversations'))
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should generate URL for preprod cloud', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Preprod
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('environment.api.preprod.powerplatform.com'))
    })

    it('should generate URL for mooncake cloud', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Mooncake
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('environment.api.powerplatform.partner.microsoftonline.cn'))
    })

    it('should generate URL for custom cloud', function () {
      const customCloud = 'custom.powerplatform.com'
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: customCloud
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes(customCloud))
    })

    it('should generate URL for prebuilt agent', function () {
      const settings = {
        ...baseSettings,
        copilotAgentType: AgentType.Prebuilt
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('conversations'))
    })

    it('should generate URL with conversation ID', function () {
      const conversationId = 'test-conversation-123'
      const settings = { ...baseSettings }
      const url = getCopilotStudioConnectionUrl(settings, conversationId)

      assert(url.includes(conversationId))
    })

    it('should use direct connect URL when provided', function () {
      const directUrl = 'https://direct.connection.com/path'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('direct.connection.com'))
      assert(url.includes('conversations'))
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should handle direct connect URL with existing api-version', function () {
      const directUrl = 'https://direct.connection.com/path?api-version=2023-01-01'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('api-version=2023-01-01'))
      assert(!url.includes('api-version=2022-03-01-preview'))
    })

    it('should handle direct connect URL with trailing slash', function () {
      const directUrl = 'https://direct.connection.com/path/'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(!url.includes('//conversations'))
    })

    it('should handle direct connect URL with existing conversations path', function () {
      const directUrl = 'https://direct.connection.com/path/conversations/existing'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const url = getCopilotStudioConnectionUrl(settings)

      assert(url.includes('/conversations'))
      assert(!url.includes('/conversations/existing/conversations'))
    })

    it('should handle direct connect URL with conversation ID', function () {
      const directUrl = 'https://direct.connection.com/path'
      const conversationId = 'test-conversation-456'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const url = getCopilotStudioConnectionUrl(settings, conversationId)

      assert(url.includes(conversationId))
    })

    it('should fix missing tenant ID in direct connect URL', function () {
      const directUrlWithMissingTenant = 'https://api.powerplatform.com/tenants/00000000-0000-0000-0000-000000000000/path'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrlWithMissingTenant
      }
      const url = getCopilotStudioConnectionUrl(settings)

      // Should fall back to normal settings flow
      assert(url.includes('environment.api.powerplatform.com'))
      assert(!url.includes('00000000-0000-0000-0000-000000000000'))
    })

    it('should throw error for missing environment ID', function () {
      const settings = {
        ...baseSettings,
        environmentId: ''
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /EnvironmentId must be provided/)
    })

    it('should throw error for whitespace-only environment ID', function () {
      const settings = {
        ...baseSettings,
        environmentId: '   '
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /EnvironmentId must be provided/)
    })

    it('should throw error for missing agent identifier', function () {
      const settings = {
        ...baseSettings,
        agentIdentifier: ''
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /AgentIdentifier must be provided/)
    })

    it('should throw error for whitespace-only agent identifier', function () {
      const settings = {
        ...baseSettings,
        agentIdentifier: '   '
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /AgentIdentifier must be provided/)
    })

    it('should throw error for Other cloud without custom cloud address', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other
        // customPowerPlatformCloud not provided
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /customPowerPlatformCloud must be provided/)
    })

    it('should throw error for Other cloud with empty custom cloud address', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: ''
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /customPowerPlatformCloud must be provided/)
    })

    it('should throw error for Other cloud with whitespace-only custom cloud address', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: '   '
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /customPowerPlatformCloud must be provided/)
    })

    it('should throw error for invalid custom cloud URL', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: 'http://[invalid-ipv6::]' // Invalid URL format
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /customPowerPlatformCloud must be a valid URL/)
    })

    it('should throw error for invalid direct connect URL', function () {
      const settings = {
        ...baseSettings,
        directConnectUrl: 'invalid-url'
      }

      assert.throws(() => {
        getCopilotStudioConnectionUrl(settings)
      }, /Invalid URL/) // Matches actual native URL constructor error
    })

    it('should handle all PowerPlatformCloud values', function () {
      const clouds = [
        PowerPlatformCloud.Prod,
        PowerPlatformCloud.Preprod,
        PowerPlatformCloud.Mooncake,
        PowerPlatformCloud.FirstRelease,
        PowerPlatformCloud.Dev,
        PowerPlatformCloud.Test,
        PowerPlatformCloud.Prv,
        PowerPlatformCloud.Exp,
        PowerPlatformCloud.Local,
        PowerPlatformCloud.Gov,
        PowerPlatformCloud.GovFR,
        PowerPlatformCloud.High,
        PowerPlatformCloud.DoD,
        PowerPlatformCloud.Ex,
        PowerPlatformCloud.Rx
      ]

      clouds.forEach(cloud => {
        const settings = {
          ...baseSettings,
          cloud
        }
        const url = getCopilotStudioConnectionUrl(settings)
        assert(typeof url === 'string')
        assert(url.length > 0)
      })
    })

    it('should handle both AgentType values', function () {
      const agentTypes = [AgentType.Published, AgentType.Prebuilt]

      agentTypes.forEach(agentType => {
        const settings = {
          ...baseSettings,
          copilotAgentType: agentType
        }
        const url = getCopilotStudioConnectionUrl(settings)
        assert(typeof url === 'string')
        assert(url.length > 0)
      })
    })

    it('should handle environment IDs with different formats', function () {
      const environmentIds = [
        'A47151CF-4F34-488F-B377-EBE84E17B478', // Standard GUID format
        'a47151cf4f34488fb377ebe84e17b478', // No dashes, lowercase
        'A47151CF4F34488FB377EBE84E17B478', // No dashes, uppercase
        '12345678-1234-1234-1234-123456789012' // Different values
      ]

      environmentIds.forEach(environmentId => {
        const settings = {
          ...baseSettings,
          environmentId
        }
        const url = getCopilotStudioConnectionUrl(settings)
        assert(typeof url === 'string')
        assert(url.length > 0)
      })
    })
  })

  describe('getTokenAudience', function () {
    it('should return correct audience for production', function () {
      const audience = getTokenAudience(baseSettings)
      assert.strictEqual(audience, 'https://api.powerplatform.com/.default')
    })

    it('should return correct audience for preprod', function () {
      const settings = { ...baseSettings, cloud: PowerPlatformCloud.Preprod }
      const audience = getTokenAudience(settings)
      assert.strictEqual(audience, 'https://api.preprod.powerplatform.com/.default')
    })

    it('should return correct audience for mooncake', function () {
      const settings = { ...baseSettings, cloud: PowerPlatformCloud.Mooncake }
      const audience = getTokenAudience(settings)
      assert.strictEqual(audience, 'https://api.powerplatform.partner.microsoftonline.cn/.default')
    })

    it('should return correct audience for custom cloud', function () {
      const customCloud = 'custom.powerplatform.com'
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: customCloud
      }
      const audience = getTokenAudience(settings)
      assert.strictEqual(audience, `https://${customCloud}/.default`)
    })

    it('should return audience from direct connect URL', function () {
      const directUrl = 'https://api.powerplatform.com/direct/path'
      const settings = {
        ...baseSettings,
        directConnectUrl: directUrl
      }
      const audience = getTokenAudience(settings)
      assert.strictEqual(audience, 'https://api.powerplatform.com/.default')
    })

    it('should handle direct connect URL without settings', function () {
      const directUrl = 'https://api.preprod.powerplatform.com/direct/path'
      const audience = getTokenAudience(undefined, PowerPlatformCloud.Unknown, '', directUrl)
      assert.strictEqual(audience, 'https://api.preprod.powerplatform.com/.default')
    })

    it('should use cloud parameter when settings not provided', function () {
      const audience = getTokenAudience(undefined, PowerPlatformCloud.Preprod)
      assert.strictEqual(audience, 'https://api.preprod.powerplatform.com/.default')
    })

    it('should use cloudBaseAddress for Other cloud', function () {
      const customCloud = 'custom.api.com'
      const audience = getTokenAudience(undefined, PowerPlatformCloud.Other, customCloud)
      assert.strictEqual(audience, `https://${customCloud}/.default`)
    })

    it('should throw error when Other cloud without cloudBaseAddress', function () {
      assert.throws(() => {
        getTokenAudience(undefined, PowerPlatformCloud.Other)
      }, /cloudBaseAddress must be provided/)
    })

    it('should throw error when no settings and Unknown cloud', function () {
      assert.throws(() => {
        getTokenAudience(undefined, PowerPlatformCloud.Unknown)
      }, /Either settings or cloud must be provided/)
    })

    it('should throw error for invalid custom cloud URL in settings', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other
        // No customPowerPlatformCloud provided
      }

      assert.throws(() => {
        getTokenAudience(settings)
      }, /Either CustomPowerPlatformCloud or cloudBaseAddress must be provided when PowerPlatformCloudCategory is Other/)
    })

    it('should throw error for invalid direct connect URL', function () {
      const settings = {
        ...baseSettings,
        directConnectUrl: 'invalid-url'
      }

      assert.throws(() => {
        getTokenAudience(settings)
      }, /Invalid URL/) // Matches actual native URL constructor error
    })

    it('should handle unknown cloud in direct URL with fallback', function () {
      const directUrl = 'https://unknown.endpoint.com/path'
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Preprod,
        directConnectUrl: directUrl
      }

      const audience = getTokenAudience(settings)
      assert.strictEqual(audience, 'https://api.preprod.powerplatform.com/.default')
    })

    it('should throw error for unknown cloud in direct URL without fallback', function () {
      const directUrl = 'https://unknown.endpoint.com/path'
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Unknown,
        directConnectUrl: directUrl
      }

      assert.throws(() => {
        getTokenAudience(settings)
      }, /Unable to resolve the PowerPlatform Cloud/)
    })

    it('should handle all supported cloud endpoints', function () {
      const cloudToEndpointMap = {
        [PowerPlatformCloud.Prod]: 'api.powerplatform.com',
        [PowerPlatformCloud.Preprod]: 'api.preprod.powerplatform.com',
        [PowerPlatformCloud.Mooncake]: 'api.powerplatform.partner.microsoftonline.cn',
        [PowerPlatformCloud.FirstRelease]: 'api.powerplatform.com',
        [PowerPlatformCloud.Dev]: 'api.dev.powerplatform.com',
        [PowerPlatformCloud.Test]: 'api.test.powerplatform.com',
        [PowerPlatformCloud.Prv]: 'api.prv.powerplatform.com',
        [PowerPlatformCloud.Exp]: 'api.exp.powerplatform.com',
        [PowerPlatformCloud.Local]: 'api.powerplatform.localhost',
        [PowerPlatformCloud.Gov]: 'api.gov.powerplatform.microsoft.us',
        [PowerPlatformCloud.GovFR]: 'api.gov.powerplatform.microsoft.us',
        [PowerPlatformCloud.High]: 'api.high.powerplatform.microsoft.us',
        [PowerPlatformCloud.DoD]: 'api.appsplatform.us',
        [PowerPlatformCloud.Ex]: 'api.powerplatform.eaglex.ic.gov',
        [PowerPlatformCloud.Rx]: 'api.powerplatform.microsoft.scloud'
      }

      Object.entries(cloudToEndpointMap).forEach(([cloud, expectedEndpoint]) => {
        const settings = { ...baseSettings, cloud: cloud as PowerPlatformCloud }
        const audience = getTokenAudience(settings)
        assert.strictEqual(audience, `https://${expectedEndpoint}/.default`)
      })
    })
  })

  describe('URL and validation helpers', function () {
    it('should validate HTTP URLs correctly', function () {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://api.powerplatform.com/path',
        'https://custom.domain.co.uk/path?query=value'
      ]

      validUrls.forEach(url => {
        // Test through getCopilotStudioConnectionUrl with directConnectUrl
        const settings = {
          ...baseSettings,
          directConnectUrl: url
        }
        const result = getCopilotStudioConnectionUrl(settings)
        assert(typeof result === 'string')
      })
    })

    it('should handle URLs without protocol', function () {
      const settings = {
        ...baseSettings,
        cloud: PowerPlatformCloud.Other,
        customPowerPlatformCloud: 'custom.domain.com'
      }
      const url = getCopilotStudioConnectionUrl(settings)
      assert(url.includes('custom.domain.com'))
    })

    it('should properly format environment endpoints', function () {
      const testCases = [
        {
          cloud: PowerPlatformCloud.Prod,
          environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
          expectedPattern: /a47151cf4f34488fb377ebe84e17b4\.78\.environment\.api\.powerplatform\.com/
        },
        {
          cloud: PowerPlatformCloud.FirstRelease,
          environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
          expectedPattern: /a47151cf4f34488fb377ebe84e17b4\.78\.environment\.api\.powerplatform\.com/
        },
        {
          cloud: PowerPlatformCloud.Preprod,
          environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
          expectedPattern: /a47151cf4f34488fb377ebe84e17b47\.8\.environment\.api\.preprod\.powerplatform\.com/
        }
      ]

      testCases.forEach(({ cloud, environmentId, expectedPattern }) => {
        const settings = {
          ...baseSettings,
          cloud,
          environmentId
        }
        const url = getCopilotStudioConnectionUrl(settings)
        assert(expectedPattern.test(url), `URL ${url} should match pattern ${expectedPattern}`)
      })
    })
  })
})
