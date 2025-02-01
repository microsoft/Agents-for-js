# @microsoft/agents-copilotstudio-client

## Overview

The `@microsoft/agents-copilotstudio-client` package allows you to interact with Copilot Studio Agents using the Direct Engine Protocol. This client library is designed to facilitate communication with agents, enabling seamless integration and interaction within your JavaScript or TypeScript applications.

> Note: The Client needs to be initialized with a valid JWT Token.

## Installation

To install the package, use npm or yarn:

```sh
npm install @microsoft/agents-copilotstudio-client
```

## Pre-requisites

Create and deploy an agent in Copilot Studio, see [this guide](https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-get-started?tabs=web) for a quick start

Obtain the Agent configuration values from `<YourAgent>/Settings/Advanced/Metadata`, you will need:

- Environment ID
- Tenant ID
- Agent app ID
- Schema name

Create an Entra ID app registration with permissions in the PowerPlatform API: `CopilotStudio.Copilots.Invoke`

> Note: If you do not see `Power Platform API` in the list of API's your organization uses, you need to add the Power Platform API to your tenant. To do that, goto [Power Platform API Authentication](https://learn.microsoft.com/power-platform/admin/programmability-authentication-v2#step-2-configure-api-permissions) and follow the instructions on Step 2 to add the Power Platform Admin API to your Tenant

## Usage

The client requires the `connectionSettings` and a the `jwt token` to authenticate in the service.

```ts
const createClient = async (): Promise<CopilotStudioClient> => {
  const settings = loadCopilotStudioConnectionSettingsFromEnv()
  const token = await acquireToken(settings)
  const copilotClient = new CopilotStudioClient(settings, token)
  return copilotClient
}
const copilotClient = await createClient()
const replies = await copilotClient.startConversationAsync(true)
replies.forEach(r => console.log(r.text))
```


