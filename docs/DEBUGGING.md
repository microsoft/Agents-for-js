# Debugging and logging

This document describes how we use the [`debug`](https://www.npmjs.com/package/debug) library in this repository and the project's custom wrapper, [`logger`](../packages/agents-activity/src/logger.ts). The wrapper standardizes how namespaced loggers are created and configured across the codebase, and is the recommended API for authors and contributors. The rest of this document explains namespaces, recommended log levels, how to enable logging, and examples that use the wrapper where appropriate.

## Quick start (for users)
Logging can be configured using environment variables or the command line.

#### From environment variables:
- To enable logs for only the app namespace:
```bash
    DEBUG=agents:app:*
```
- To enable multiple namespaces:
```bash
    DEBUG=agents:app:info,agents:authorization:*
```
- To exclude a namespace:
```bash
    DEBUG=*,-msal:* (include all debuggers except those starting with "msal:")
```
- To disable:
  - Unset `DEBUG` or set it to an empty value

#### From the command line:
  - With npm scripts (cross-platform using `cross-env`):
```bash
    cross-env DEBUG=agents:* npm run start
```

### Other settings available throgh env variables
 - `DEBUG_HIDE_DATE`: Hide date from debug output (non-TTY).
 - `DEBUG_COLORS`: Whether or not to use colors in the debug output.
 - `DEBUG_DEPTH`: Object inspection depth.
 - `DEBUG_SHOW_HIDDEN`: Shows hidden properties on inspected objects.

## Log levels (convention)
- `debug`: Regular debugging information
- `error`: Errors that affect functionality
- `info`: Important runtime information for users/developers
- `warn`: Warnings (non-fatal but noteworthy)

#### Examples of namespaces using levels:

- agents:authorization:debug
- agents:authorization:*:info
- agents:*:error

Recommendation: prefer the pattern `<project>:<component>:<level>`. This keeps it easy to enable exactly what you need:


## Examples

### Creating a logger using the wrapper (Node / TypeScript)

Common pattern:

```ts
import { debug } from '@microsoft/agents-activity/logger'

const logger = debug('agents:turnState')

logger.debug('property not found in turnState', turnState);
logger.error('Invalid conversation id', err);
```

### Browser usage

In browser contexts set `localStorage.debug`:

```js
localStorage.debug = 'agents:turnState:*';
```
