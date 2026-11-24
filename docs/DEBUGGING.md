# Debugging and logging

This document describes how we use the [`debug`](https://www.npmjs.com/package/debug) library through the logging wrapper exported by `@microsoft/agents-telemetry`. The wrapper standardizes namespaced loggers and forwards enabled messages to OpenTelemetry logging when available. The rest of this document explains namespaces, recommended log levels, how to enable logging, and examples where appropriate.

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
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:turnState')

logger.debug('property not found in turnState', turnState);
logger.error('Invalid conversation id', err);
```

### Browser usage

In browser contexts set `localStorage.debug`:

```js
localStorage.debug = 'agents:turnState:*';
```


### Turn error diagnostics

The default CloudAdapter handler sends generic user messages. Diagnostic traces
contain the error message; they omit stack traces unless
`CloudAdapterOptions__emitStackTrace=true` is explicitly configured for development.
CloudAdapter delivers trace activities only to Emulator. This option does not
redact sensitive text embedded in error messages and does not detect NODE_ENV.

Migration note: `emitStackTrace` now controls outbound trace stacks rather than
server log verbosity. Enabled server logs retain available stacks independently;
actual logging depends on namespace and sink configuration.

Use `agent.onError(async (context, error) => { ... })` or assign
`adapter.onTurnError` for friendly responses or application-defined recovery.
A replacement owns logging and responses completely; default diagnostic options
do not govern it. Await all turn work before the callback completes.
