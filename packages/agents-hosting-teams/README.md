# @microsoft/agents-hosting-teams

This package contains Teams specific features, such as:

- Message Extensions
- Teams Meetings 
- Teams SSO Flows
- Parse Activity with specific Teams features

## Installation

```bash
npm install @microsoft/agents-hosting-teams
```

## Usage

Use `TeamsCloudAdapter` and `TeamsActivityHandler` to subscribe to Teams specific events.

```ts
// index.ts
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new TeamsCloudAdapter(authConfig)
```

```ts
// agent.ts
export class TeamsMultiFeatureAgent extends TeamsActivityHandler {
    constructor () {
        super()
    }

    async handleTeamsMessagingExtensionQuery () {
        // This function is intentionally left unimplemented. Provide your own implementation.
    }
}
```