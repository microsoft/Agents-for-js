# @microsoft/agents-activity

## Overview

The `@microsoft/agents-activity` implements the Activity Protocol Specification https://github.com/microsoft/Agents/blob/main/specs/activity/protocol-activity.md. 

It provides declaration files defined with TypeScript and validators based on `zod`.

## Installation

To install the package, use npm:

```sh
npm install @microsoft/agents-activity
```

## Learn more

- [Activity Protocol](https://learn.microsoft.com/microsoft-365/agents-sdk/activity-protocol) Learn how activities standardize messages, events, and channel interactions, and how to access their main properties.
- [Activity validation](https://learn.microsoft.com/microsoft-365/agents-sdk/bf-migration-nodejs#agents-sdk-activity-class) Learn how the Activity class uses Zod and validates JSON or JavaScript objects with `fromJson` and `fromObject`.
- [Activity class](https://learn.microsoft.com/javascript/api/@microsoft/agents-activity/activity) Find the typed activity properties, constructors, parsing methods, and conversation-reference helpers.
- [TurnContext class](https://learn.microsoft.com/javascript/api/@microsoft/agents-hosting/turncontext) Access the incoming activity and operations for one conversation turn.
- [BaseAdapter class](https://learn.microsoft.com/javascript/api/@microsoft/agents-hosting/baseadapter) Understand the adapter that processes and sends activities.
- [TurnState class](https://learn.microsoft.com/javascript/api/@microsoft/agents-hosting/turnstate) Find the state available while handling a turn.
- [Package overview](https://learn.microsoft.com/javascript/api/overview/agents-overview#packages-overview) Identify the package as the SDK's Activity Protocol types and validators.
