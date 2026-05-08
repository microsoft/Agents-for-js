# Authorization Sample

This sample shows user authorization flows with multiple handlers, including OAuth, SSO, and OBO scenarios.

> [!IMPORTANT]
> These samples are intended for testing and validation only. They are not production-ready reference implementations.

> [!NOTE]
> For the best testing experience, configure each authorization handler with its own Azure Bot connection name.

Operations covered by this sample:

- OAuth sign-in with the `auth` handler
- SSO sign-in with the `sso` handler
- OBO sign-in with the `obo_auto` handler
- OBO sign-in plus manual token exchange with the `obo_manual` handler
- Per-handler and global sign-in status checks
- Sign-in success and failure callbacks
- Per-handler and global sign-out

Environment file templates are included in this folder:

- `absGraphLatest.env.TEMPLATE`: template for `absGraphLatest.ts`
- `absGraphLegacy.env.TEMPLATE`: template for `absGraphLegacy.ts`

- `absGraphLatest.ts`: uses the current `AgentApplication__UserAuthorization__Handlers__*` environment variable format
- `absGraphLegacy.ts`: uses the deprecated `{handlerId}_{property}` environment variable format
- `absGraphBase.ts`: shared sample logic and commands

Run from `samples/`:

```bash
cp ./authorization/absGraphLatest.env.TEMPLATE ./authorization/absGraphLatest.env
cp ./authorization/absGraphLegacy.env.TEMPLATE ./authorization/absGraphLegacy.env
npm run authorization:absGraphLatest
npm run authorization:absGraphLegacy
```

Each script loads its own environment file:

- `authorization:absGraphLatest` -> `samples/authorization/absGraphLatest.env`
- `authorization:absGraphLegacy` -> `samples/authorization/absGraphLegacy.env`