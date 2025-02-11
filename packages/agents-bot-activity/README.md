# @microsoft/agents-bot-activity

## Overview

The `@microsoft/agents-bot-activity` implements the Activity Protocol Specification https://github.com/microsoft/Agents/blob/main/specs/activity/protocol-activity.md. 

It provides declaration files defined with TypeScript and validators based on `zod`.

## Installation

To install the package, use npm:

```sh
npm install @microsoft/agents-bot-activity
```

## Usage

```ts
const activity = Activity.fromObject({ type: ActivityTypes.Message, text: 'Hello World' })
```

