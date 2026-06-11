# fastify-empty-agent

The simplest agent hosted with [Fastify](https://fastify.dev/), used to validate the
`@microsoft/agents-hosting-fastify` package and different authentication options.

Mirrors the `empty-agent` sample but uses `startServer` from
`@microsoft/agents-hosting-fastify` instead of the Express variant. Copy
`env.TEMPLATE` to `.env` and populate the auth values, then run with `npm start`
from this folder.
