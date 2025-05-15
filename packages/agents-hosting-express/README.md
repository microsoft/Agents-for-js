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