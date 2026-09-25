# fastify-empty-agent

The simplest agent hosted with [Fastify](https://fastify.dev/), used to validate the
`@microsoft/agents-hosting-fastify` package and different authentication options.

Mirrors the `empty-agent` sample but uses `startServer` from
`@microsoft/agents-hosting-fastify` instead of the Express variant. Copy
`env.TEMPLATE` to `.env` and populate the auth values, then run with `npm start`
from this folder.

## JSON configuration

`config.json.TEMPLATE` shows the equivalent provider-neutral hierarchical JSON
shape. Copy it to `config.DEVELOPMENT.json` and populate the authentication
values, then run:

```powershell
Copy-Item config.json.TEMPLATE config.DEVELOPMENT.json
npm run start:config
```

The underlying command-line option accepts any path:

```powershell
node ./dist/agent.js --config-file path\to\config.json
```

The agent registers the JSON file in `overrideEnvironment` mode before creating
`EmptyAgent`. JSON therefore overrides environment configuration while direct
runtime options retain precedence. JSON values are used literally;
environment-variable substitution is not performed automatically. Populated
`*.DEVELOPMENT.json` files are ignored by Git.
