# Slack agent sample

This sample demonstrates Slack message routing, Slack Web API calls, interactive Block Kit actions, and streamed agent responses through the Azure Bot Service Slack channel.

The traffic path is:

```text
Slack → Azure Bot Service Slack channel → local agent → Azure Bot Service → Slack
```

The sample uses the default `POST /api/messages` endpoint on port `3978`.

## Prerequisites

- Node.js 20 or later and the repository dependencies installed.
- An Azure Bot resource with a Microsoft Entra application registration.
- A Slack workspace where you can install and configure an app.
- [Dev Tunnels](https://learn.microsoft.com/azure/developer/dev-tunnels/get-started?tabs=windows) for local testing.

## Configure the local agent

Copy `env.TEMPLATE` to `.env` and provide the Azure Bot application credentials:

```env
connections__serviceConnection__settings__clientId=<Azure Bot app client ID>
connections__serviceConnection__settings__clientSecret=<Azure Bot app client secret>
connections__serviceConnection__settings__tenantId=<Microsoft Entra tenant ID>

connectionsMap__0__connection=serviceConnection
connectionsMap__0__serviceUrl=*

# Optional local fallback. Azure Bot Service normally injects this token per turn.
SLACK_TOKEN=xoxb-...
```

`SLACK_TOKEN` enables the extension to make outbound Slack Web API calls when Azure Bot Service does not supply `activity.channelData.ApiToken`. It does not receive Slack events or replace the Azure Bot Service Slack channel.

## Connect Slack to Azure Bot Service

1. [Create a Slack app](https://api.slack.com/apps) and collect its client ID, client secret, and signing secret from **Basic Information**.
2. In the Azure Bot resource, open **Channels** and add **Slack**. Enter those Slack credentials, but do not save the channel yet.
3. Copy the OAuth redirect URL and event-subscription request URL shown in the Azure Bot Slack channel configuration.
4. Configure the Slack app with those Azure Bot URLs:

   1. In **OAuth & Permissions**, add the OAuth redirect URL.
   2. In **Event Subscriptions**, enable events and set the request URL to the event-subscription URL.
   3. In **Interactivity & Shortcuts**, enable interactivity and set the request URL to the event-subscription URL. This lets Block Kit button clicks reach Azure Bot Service.
   4. Under **Subscribe to bot events**, add:

      - `message.im` to test the bot in a direct message.
      - `app_mention` to respond to mentions in a channel.
      - `message.channels` when the bot needs every message in public channels.

   5. In **App Home**, enable the Messages tab and allow users to send messages to the app.
   6. Add the bot token scopes required by the events and sample features:

      - `chat:write`
      - `assistant:write` for thread titles and suggested prompts
      - `im:history` for direct messages
      - `app_mentions:read` for `app_mention` events
      - `channels:history` for public-channel messages

      Invite the app to each public channel used for testing. Alternatively, add `chat:write.public` to let the app post to public channels without joining them.

5. Return to Azure Bot Service and save the Slack channel. Complete the OAuth prompt to install the Slack app in the workspace.
6. Reinstall the Slack app after changing scopes or event subscriptions. Add it to each channel where you plan to mention it.

This sample does not use Incoming Webhooks or Socket Mode. Slack events go to Azure Bot Service, which then sends Bot Framework activities to the local agent.

The `stream demo` command uses Slack's [streaming API](https://docs.slack.dev/reference/methods/chat.startStream/). The `topic`, `prompts`, and `status` commands use the [Slack assistant APIs](https://docs.slack.dev/ai/developing-agents/).

## Run locally with Dev Tunnels

From this directory:

```sh
npm start
```

The agent listens on port `3978`. In a second terminal, start an anonymous Dev Tunnel:

```sh
devtunnel host -p 3978 --allow-anonymous
```

Copy the tunnel URL and set the Azure Bot resource **Configuration** > **Messaging endpoint** to:

```text
https://<your-tunnel-host>/api/messages
```

Save the endpoint. Update it whenever Dev Tunnels gives you a new host.

## Try the sample

Open a direct message with the Slack app and send:

| Message | Expected behavior |
|---|---|
| `help` | Lists the available commands. |
| `topic <title>` | Sets the Slack assistant thread title. |
| `prompts` | Adds suggested prompts to the thread. |
| `status <text>` | Sets the assistant thread status. |
| `stream demo` | Streams text and task updates to the thread. |
| `buttons` | Posts interactive Block Kit buttons. |
| Any other message | Sends a basic reply. |

## Troubleshooting

| Symptom | Check |
|---|---|
| No request reaches the local agent | Verify Slack Event Subscriptions uses the Azure Bot event URL, the app is installed, and the matching event such as `message.im` is subscribed. |
| Slack reports the event URL cannot be verified | Copy the exact Azure Bot event-subscription URL again; it is not the Dev Tunnel endpoint. |
| `POST /api/messages` returns `401` | Check `.env` client ID, secret, and tenant match the Azure Bot identity. |
| An inbound request reaches the local agent but no Slack reply appears | Check the Azure Bot Slack channel credentials and the Slack app installation/scopes. |
