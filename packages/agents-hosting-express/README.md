# microsoft/agents-hosting-express

## Overview

Provides integration to host the agent in Express using `startServer`

## Usage

 ```ts
 import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 import { startServer } from '@microsoft/agents-hosting-express';
 
 const app = new AgentApplication<TurnState>();
 app.onMessage('hello', async (context, state) => {
   await context.sendActivity('Hello, world!');
 });
 startServer(app);
  ```

## Adapter Configuration

Use `configureAdapter` to customize the `CloudAdapter` used by `startServer`.
This is useful for `ActivityHandler` scenarios where `startServer` creates the adapter internally,
and for `AgentApplication` scenarios where you want to reuse the application's adapter and add middleware.

 ```ts
 import { startServer } from '@microsoft/agents-hosting-express';
 import { SetTeamsApiClientMiddleware, TeamsActivityHandler } from '@microsoft/agents-hosting-extensions-teams';

 class TeamsBot extends TeamsActivityHandler {}

 startServer(new TeamsBot(), {
   configureAdapter: (adapter) => {
     adapter.use(new SetTeamsApiClientMiddleware())
   }
 })
 ```
