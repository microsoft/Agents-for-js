# empty-agent

The simplest agent, used to validate different authentication options

## Configuration

For environment configuration, copy `env.TEMPLATE` to `.env` and populate the
authentication values, then run:

```powershell
npm start
```

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