# Authorization sample: automatic and manual OBO

This sample uses the [Microsoft 365 Agents SDK for JavaScript](https://github.com/microsoft/Agents-for-js) to sign a user in, exchange their token on behalf of that user (OBO), and read their Microsoft Graph profile.

> These samples are intended for testing and validation. They are not production-ready reference implementations.

Start with the **latest** environment format and the `obo_auto` / `obo_manual` commands below. The sample also retains OAuth, Teams SSO, and legacy configuration examples for separate testing.

## Before you start

This walkthrough uses Azure Portal's **Test in Web Chat**, a single tenant, and client secrets for local development. You need:

- An Azure subscription and an Entra tenant where you can create or use an Azure Bot and two app registrations.
- A work or school test account in that tenant, and an administrator's help if your tenant requires admin consent.
- Node.js 22 or later, npm, and the [dev tunnel CLI](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started).
- A public-cloud bot without regional data residency for the exact URLs below. For other environments, use the [OAuth redirect URL table](https://learn.microsoft.com/en-us/azure/bot-service/ref-oauth-redirect-urls) and matching SDK OAuth configuration.

The sample uses in-memory state and is intended for learning and validation. Client secrets in a local environment file are development credentials; keep the file out of source control.

## 1. Identify the two app registrations

Use one registration for the bot's channel identity and a second registration for user authorization and OBO. Both registrations belong to your test tenant.

| Name in these instructions | Role | Environment keys |
| --- | --- | --- |
| **Bot app** | Identifies the agent to Azure Bot Service. | `connections__serviceConnection__settings__*` |
| **OAuth/OBO app** | Obtains the initial user token for its own API, then exchanges it for a Graph token. | `connections__oboConnection__settings__*` |

For each registration, record its **Application (client) ID**, **Directory (tenant) ID**, and a client-secret **Value** from **Certificates & secrets > New client secret**. The secret's ID is not its value. If a secret contains `#`, quote the full value in the environment file, for example `clientSecret="value#suffix"`.

Create or identify a **single-tenant Azure Bot** whose Microsoft App ID and tenant match the **Bot app**. The [Azure Bot provisioning guide](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/provision-azure-bot-service-manually) explains resource creation. Use the Bot app's credentials for `serviceConnection`.

The remaining Azure steps apply to the **OAuth/OBO app**, not the Bot app. Use that same OAuth/OBO registration as the OAuth connection's client, the exposed API resource, and the SDK's OBO client. This also satisfies the SDK's audience/client relationship check.

## 2. Configure user authorization on the OAuth/OBO app

1. In **Microsoft Entra ID > App registrations**, open the OAuth/OBO app. Its account type should be **Accounts in this organizational directory only**.
2. Under **Authentication > Add a platform > Web**, add `https://token.botframework.com/.auth/web/redirect`.
3. Under **Expose an API**, set the Application ID URI to `api://<OBO_APP_ID>`, replacing the placeholder with this app's client ID.
4. Select **Add a scope**, name it `defaultScopes`, fill in its consent display name/description, and enable it. Choose who can consent according to your tenant's policy. The complete scope is `api://<OBO_APP_ID>/defaultScopes`.
5. Under **API permissions > Add a permission > Microsoft Graph > Delegated permissions**, add `User.Read`. Do not choose application permissions for this user flow.
6. Arrange consent for Graph `User.Read` and the exposed `defaultScopes` scope. For a predictable administrator-approved test, add the exposed delegated scope under **API permissions > Add a permission > My APIs** (or **APIs my organization uses**), select the OAuth/OBO app, and have an authorized administrator grant consent for the listed permissions before testing. If your tenant uses user consent instead, ensure it covers both the exposed scope and downstream Graph permission. Signing in for the exposed scope alone does not establish Graph consent, and a downstream OBO exchange cannot display a consent prompt itself.

These permissions let the sample call `GET https://graph.microsoft.com/v1.0/me`. The SDK requests Graph's `.default` scope during OBO; that scope uses configured delegated permissions and consent. It does not add permissions or grant consent automatically.

See the [OBO protocol and consent requirements](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow).

## 3. Add two OAuth connections to the Azure Bot

Open the **Azure Bot > Settings > Configuration > OAuth Connection Settings** and add these settings separately. Their names keep the two examples' stored tokens independent.

| Azure field | Automatic example | Manual example |
| --- | --- | --- |
| Name | `OboAutoConnection` | `OboManualConnection` |
| Service Provider | **Azure Active Directory v2** (Microsoft Entra v2, with a client-secret field) | Same provider |
| Client id | OAuth/OBO app's client ID | Same app |
| Client secret | OAuth/OBO app's secret **value** | Same app |
| Tenant ID | OAuth/OBO app's tenant ID | Same tenant |
| Scopes | `api://<OBO_APP_ID>/defaultScopes` | Same exposed scope |
| Token Exchange URL | Leave blank | Leave blank |

Portal labels may say **Microsoft Entra ID** instead of Azure Active Directory. Choose the v2 client-secret provider, not the v1, certificate, or federated-credential variant.

The Scopes field requests the exposed API's access token. Standard sign-in scopes such as `openid profile offline_access` may also be used with this provider; if entered, separate them with spaces and keep the exposed API as the only resource scope. Do not add Graph resource scopes to this initial request.

Save and use **Test Connection** on each setting. Sign in and complete the allowed consent. A successful connection test proves initial OAuth works; the sample's successful Graph request is the remaining OBO check.

The two scope settings serve different purposes:

| Location | Scope | Token's intended recipient |
| --- | --- | --- |
| Azure Bot OAuth connection | `api://<OBO_APP_ID>/defaultScopes` | OAuth/OBO app |
| SDK automatic configuration or explicit exchange call | `https://graph.microsoft.com/.default` | Microsoft Graph |

A token issued directly for Graph cannot be redeemed by your OAuth/OBO app as an OBO assertion. Likewise, an initial token for your app must not be sent to Graph. The SDK checks audience and client claims before exchanging; an `api://` prefix alone is not proof of correct configuration.

**Token Exchange URL** is used for SSO configuration. It is not Graph's URL and is not where the downstream OBO scope belongs. The [Bot Service OAuth setup](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-authentication) documents the connection fields; use this sample's Agents SDK code rather than the older Bot Framework application instructions.

## 4. Fill in the environment file

The following names refer to different things:

| Setting or name | Meaning |
| --- | --- |
| `OboAutoConnection` / `OboManualConnection` | OAuth settings created on the Azure Bot. These are the values of `azureBotOAuthConnectionName`. |
| `oboConnection` | SDK credential configuration in this process. This is the value of `oboConnectionName`. It is not another Azure OAuth setting. |
| Handler ID | Name used in route registration, token calls, and the matching environment-key segment. |

Fill in the six credential values in the supplied template. The three `serviceConnection` values belong to the **Bot app**. The three `oboConnection` values belong to the **OAuth/OBO app**.

Keep `connectionsMap__0__serviceUrl=*` mapped to `serviceConnection` for channel traffic. OBO selects the SDK connection by name; no `serviceUrl=obo` mapping is needed.

### Local sample configuration

Copy `absGraphLatest.env.TEMPLATE` as described below. It contains complete settings for these handlers:

| Handler | Azure OAuth connection | OBO behavior |
| --- | --- | --- |
| `obo_auto` | `OboAutoConnection` | Configures `oboConnectionName=oboConnection` and `oboScopes=https://graph.microsoft.com/.default`; `getToken()` returns the Graph token. |
| `obo_manual` | `OboManualConnection` | Configures `oboConnectionName=oboConnection` and leaves `oboScopes` absent; code supplies scopes to `exchangeToken()`. |
| `auth` | `AuthConnection` | Additional direct Graph OAuth example. Its Azure connection should request Graph delegated `User.Read`. |
| `sso` | `SsoConnection` | Additional SSO/token retrieval example; requires separate channel and Azure configuration. It is not configured by this OBO walkthrough. |

For the OBO walkthrough, create only the two OBO OAuth connections and use their targeted commands. The other handler names can remain in the environment file: startup discovers their configuration locally and does not contact those Azure OAuth settings. Do not use global `+`, `=`, or `-` commands until all four Azure connections are configured.

The important current-format keys are:

```dotenv
AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__azureBotOAuthConnectionName=OboAutoConnection
AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__oboConnectionName=oboConnection
AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__oboScopes=https://graph.microsoft.com/.default

AgentApplication__UserAuthorization__Handlers__obo_manual__Settings__azureBotOAuthConnectionName=OboManualConnection
AgentApplication__UserAuthorization__Handlers__obo_manual__Settings__oboConnectionName=oboConnection
# Do not set oboScopes for obo_manual: code requests the Graph scopes.
```

## 5. Install and start the agent

Run these commands from the **Agents-for-js repository root** in Bash or PowerShell:

```sh
npm ci --ignore-scripts
npm run build
cd samples
```

The root installation supplies the workspace SDK packages, Graph helper dependencies, and `tsx`. The root build produces the packages' exported JavaScript. The `samples/` directory is not a root npm workspace; installing only inside it does not build the local SDK.

From **`samples/`**, copy the latest environment template.

Bash:

```bash
cp authorization/absGraphLatest.env.TEMPLATE authorization/absGraphLatest.env
```

PowerShell:

```powershell
Copy-Item authorization/absGraphLatest.env.TEMPLATE authorization/absGraphLatest.env
```

Fill in that file using steps 1–4. Then, from **`samples/`**:

```sh
npm run authorization:absGraphLatest
```

The script loads `authorization/absGraphLatest.env` using Node's environment-file support and listens on port 3978. Run this process and the next tunnel command in separate terminals.

In a **second terminal, from any directory**:

```sh
devtunnel host -p 3978 --allow-anonymous
```

Copy the tunnel's public HTTPS URL. In **Azure Bot > Configuration > Messaging endpoint**, enter `<TUNNEL_HTTPS_URL>/api/messages` and save. Open **Test in Web Chat** on the Azure Bot. An unauthenticated browser request to the agent is not a substitute for this channel test.

## 6. Try the commands

| Command | Expected result |
| --- | --- |
| `?` or `--help` | Shows commands without starting sign-in. |
| `+obo_auto` or `--login obo_auto` | Starts sign-in if needed, automatically obtains Graph access, and shows `signed in as ...`. |
| `=obo_auto` or `--status obo_auto` | Checks the automatic handler and Graph profile access. |
| `-obo_auto` or `--logout obo_auto` | Signs out that handler without first acquiring a token. |
| `+obo_manual` or `--login obo_manual` | Starts sign-in if needed, explicitly exchanges the token, and shows the Graph display name. |
| `=obo_manual` or `--status obo_manual` | Checks the manual handler, including its explicit exchange and Graph call. |
| `-obo_manual` or `--logout obo_manual` | Signs out the manual handler. |

Status commands may acquire or refresh downstream tokens and call Graph. They do not start an interactive sign-in. If no stored token is available, the result is `not signed in`; an exchange failure or profile failure is reported separately. An optional missing profile photo does not invalidate a successful `/me` request.

A successful profile response verifies useful Graph access. Sign out each handler and try again to test reauthorization. The Entra browser session can still sign the user in without asking for credentials again.

While a sign-in card is waiting for a verification code, the SDK sends incoming messages to that active sign-in flow before evaluating command routes. To stop an unfinished sign-in, send the exact text `CancelledByUser`, then repeat your help, status, or logout command. Closing the browser sign-in window alone may leave the code-entry flow active. Cancellation ends the pending flow; use the targeted logout command afterward to clear any previously stored token.

### Optional legacy configuration

Stop the latest process first. From **`samples/`**, copy the legacy template instead:

```bash
cp authorization/absGraphLegacy.env.TEMPLATE authorization/absGraphLegacy.env
```

PowerShell equivalent:

```powershell
Copy-Item authorization/absGraphLegacy.env.TEMPLATE authorization/absGraphLegacy.env
```

Fill in the same credentials and run, from **`samples/`**:

```sh
npm run authorization:absGraphLegacy
```

This entry point uses deprecated keys and registers handler IDs in its constructor. Use it only for compatibility testing; it has the same commands and Azure setup.

| Deprecated key | Current key |
| --- | --- |
| `obo_auto_connectionName` | `AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__azureBotOAuthConnectionName` |
| `obo_auto_obo_connection` | `AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__oboConnectionName` |
| `obo_auto_obo_scopes` | `AgentApplication__UserAuthorization__Handlers__obo_auto__Settings__oboScopes` |

The same mapping applies to `obo_manual`, with its scopes deliberately omitted. Legacy `connectionTitle` and `connectionText` correspond to current `title` and `text`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Missing module, compiler, or environment file | Run the install/build commands from their stated directories, create the environment file, and use Node.js 22+. |
| Port 3978 is busy | Stop the other sample process. Run one sample at a time. |
| Web Chat cannot reach the agent | Keep the tunnel and agent running. Check the Azure messaging endpoint ends in `/api/messages` and uses the current tunnel HTTPS URL. |
| Channel authentication fails | `serviceConnection` must match the Bot app ID, tenant, and secret configured for the Azure Bot. |
| User sign-in fails | Check the Azure OAuth connection name, OAuth/OBO tenant, secret value, redirect URI, and exposed-scope consent. |
| Token is not exchangeable | The initial OAuth connection must request the OAuth/OBO app's exposed scope, not `User.Read` or a Graph token. Check the app IDs agree. |
| OBO/token acquisition fails | Check OAuth/OBO credentials, their expiry, delegated Graph permission, and consent. This differs from having no stored sign-in token. |
| Graph rejects the request | Use the exchanged Graph token and verify delegated `User.Read` and consent. For the standalone sample, the HTTP status is included in the reply. |
| Graph is unavailable | Check network access and retry. A profile request failure does not mean that no sign-in token exists. |
| Old settings still seem active | Restart the agent after editing the environment file, then sign out and authorize the affected handler again. |
| Teams still prompts for sign-in | Teams SSO requires separate app, manifest, and authorized-client configuration. This Web Chat walkthrough does not configure it. |

Share error categories and HTTP status when asking for help. Do not paste client secrets or bearer tokens into the conversation or an issue. Token length does not establish a token's audience, permission, or usability.

## Other authentication options

- [Agents SDK OAuth and OBO APIs](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agent-oauth-configuration)
- [Teams bot SSO setup](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/authentication/bot-sso-register-aad)
- [User authorization with federated credentials](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/azure-bot-user-authorization-federated-credentials)

Teams SSO and federated credentials are additional configurations. The federated walkthrough explains useful exposed-API concepts, but its credential steps differ from the client-secret steps above.
