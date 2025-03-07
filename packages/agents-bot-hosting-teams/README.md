# @microsoft/agents-bot-hosting-teams

This package contains Teams specific features, such as:

- Message Extensions
- Teams Meetings 
- Teams SSO Flows
- Parse Activity with specific Teams features

## Installation

To install the necessary dependencies, run the following command:

```bash
npm install @microsoft/agents-bot-hosting-teams
```

## Usage

Use `TeamsCloudAdapter` and `TeamsActivityHandler` to subscribe to Teams specific events.

```ts
// index.ts
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new TeamsCloudAdapter(authConfig)
```

```ts
// bot.ts
export class TeamsMultiFeatureBot extends TeamsActivityHandler {
    constructor () {
        super()
    }

    async handleTeamsMessagingExtensionQuery () {
        // This function is intentionally left unimplemented. Provide your own implementation.
    }
}
```