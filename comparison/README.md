# M365 Agents SDK - Teams Extension
# API Surface and Gaps

## About this document

Most of this comparison is done with the TypeScript variants of each SDK. There are many features that are possible in the Agents SDK but are facilitated in the Teams SDK, and while an extra line or two might not be much here and there, for larger agents this may result in a non-insignificant amount of boilerplate and mental overhead.

## Significant Gaps

### Quotes

The Teams SDK provides several helpers to facilitate quoted messages. `ActivityContext.reply` adds a quote to the activity and sends it back to the user:

```ts
await context.reply('hello there')
```

![alt text](image.png)

Also in the SDK is a helper `ActivityContext.quote` that adds a quote to an `Activity` object based on the id for an old activity.

There is no equivalent way to do this in the Agents SDK. See the [appendix](#reply-activities) for details on the payload.

### Mentions

Teams SDK

```ts
await context.send(
new MessageActivity('hello ').addMention(context.activity.from)
)
```

Agents SDK

```ts
const mention = {
    type: 'mention',
    mentioned: context.activity.from!,
    text: `<at>${context.activity.from?.name}</at>`
}

const replyActivity = MessageFactory.text(`hello ${mention.text}`)
replyActivity.Entities = [mention]
await context.sendActivity(replyActivity)
```

## Smaller Gaps

### Graph Client

In the Python and .NET versions of the Teams SDK, an extra package needs to be installed to allow the `ActivityContext` (counterpart of`TurnContext`) to construct the Graph clients.

In TypeScript, `@microsoft/teams.graph` is already a dependency of `@microsoft/teams.apps`, so this extra step is not needed. Moreover, the TypeScript Teams SDK Graph package does not rely on the Graph SDK. Instead, it defines a lightweight HTTP client wrapper that is meant to be used with the `@microsoft/teams.graph-endpoints` package containsing a large set of Graph endpoint builders.

Across the languages, these packages inject into the `ActivityContext` a lazily-loaded Graph client that uses the app token and another that uses the user token.

Here is example usage of the app's Graph client in .NET

```c#
var user = app.Graph.Me.GetAsync().GetAwaiter().GetResult();
Console.WriteLine($"User ID: {user.id}");
Console.WriteLine($"User Display Name: {user.displayName}");
Console.WriteLine($"User Email: {user.mail}");
Console.WriteLine($"User Job Title: {user.jobTitle}");
```

In the Agents SDK for .NET, the GraphServiceClient would have to be manually instantiated with the user or app token. This is a small cost, but from a developer perspective, in the Teams SDK this takes 0 steps (as accessing the Graph field instantiates the client if it does not already exist) and it takes two steps in the Agents SDK to get the token, create the client, and a third step if client is to be persisted in a variable.

For more examples with .NET and TypeScript, see the [glossary](#graph-client-usage) section, which are taken for your convenience from this [document](https://microsoft.github.io/teams-sdk/csharp/essentials/graph).



### Cards

The Teams SDK provides a lot of adaptive card support with its own type definitions for several models important to adaptive card development. However, devs can also just import the Teams SDK cards package and use it alongside the Agents SDK.

### Documentation

One thing that is lacking in the Agents SDK samples is how to serve static files, which is especially relevant to task module and message extension features.


## Appendix

### Reply Activities

At the time of writing this (5/12/2026), the `@microsoft/teams.api` package is on version 2.10.0, and the result of

```ts
const activity = await context.reply('hello there')
```

is

```json
{
  type: 'message',
  text: '<blockquote itemscope="" itemtype="http://schema.skype.com/Reply" itemid="1778622431758">\n' +
    '<strong itemprop="mri" itemid="<redacted>">Rodrigo</strong><span itemprop="time" itemid="1778622431758"></span>\n' +
    '<p itemprop="preview">hi</p>\n' +
    '</blockquote>\r\n' +
    'hello there.',
  replyToId: '1778622431758',
  from: {
    id: '<redacted>',
    name: 'bot-agents-e2e-agentic'
  },
  conversation: {
    conversationType: 'personal',
    tenantId: '<redacted>',
    id: '<redacted>'
  },
  id: '1778622434901'
}
```

However, the repo's main branch recently had an update that produces the following activity instead, which does not work in the Teams client I tested with. It is included here because this may indicate a [different approach and new support by Teams](https://github.com/microsoft/teams.ts/commit/bc4498d86aba21dc75016765b6968ff96e1e63b0).

```json
{
  type: 'message',
  id: '1778622006252',
  serviceUrl: undefined,
  timestamp: undefined,
  locale: undefined,
  localTimestamp: undefined,
  channelId: 'msteams',
  from: {
    id: '<redacted>',
    name: 'bot-agents-e2e-agentic'
  },
  conversation: {
    conversationType: 'personal',
    tenantId: '<redacted>',
    id: '<redacted>'
  },
  relatesTo: undefined,
  recipient: undefined,
  replyToId: undefined,
  entities: [
    {
      type: 'quotedReply',
      quotedReply: { messageId: '1778622003149' }
    }
  ],
  channelData: undefined,
  text: '<quoted messageId="1778622003149"/> hello there.',
  speak: undefined,
  inputHint: undefined,
  summary: undefined,
  textFormat: undefined,
  attachmentLayout: undefined,
  attachments: undefined,
  suggestedActions: undefined,
  importance: undefined,
  deliveryMode: undefined,
  expiration: undefined,
  value: undefined
}
```

### Graph Client Usage

App's Graph client usage in .NET:

```c#
var user = app.Graph.Me.GetAsync().GetAwaiter().GetResult();
Console.WriteLine($"User ID: {user.id}");
Console.WriteLine($"User Display Name: {user.displayName}");
Console.WriteLine($"User Email: {user.mail}");
Console.WriteLine($"User Job Title: {user.jobTitle}");
```

and the TS version:

```ts
app.graph.call(endpoints.me.get).then((user) => {
  console.log(`User ID: ${user.id}`);
  console.log(`User Display Name: ${user.displayName}`);
  console.log(`User Email: ${user.mail}`);
  console.log(`User Job Title: ${user.jobTitle}`);
});
```

Next, example usage of the user's Graph client in .NET:

```c#
var user = await context.UserGraph.Me.GetAsync();
Console.WriteLine($"User ID: {user.id}");
Console.WriteLine($"User Display Name: {user.displayName}");
Console.WriteLine($"User Email: {user.mail}");
Console.WriteLine($"User Job Title: {user.jobTitle}");
```

and the TS verison:

```ts
const me = await userGraph.call(endpoints.me.get);
console.log(`User ID: ${me.id}`);
console.log(`User Display Name: ${me.displayName}`);
console.log(`User Email: ${me.mail}`);
console.log(`User Job Title: ${me.jobTitle}`);
```
