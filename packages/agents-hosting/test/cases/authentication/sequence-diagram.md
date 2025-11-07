# Sequence Diagram

This diagram shows the normal authorization route flow: app initializes routing, applies an AuthorizationHandler, shows an OAuth card and handles the magic code on first access, then proceeds directly on subsequent signed-in turns; the route handler runs only when authorized.

### Editing tool
[https://www.mermaidchart.com/app/dashboard](https://www.mermaidchart.com/app/dashboard)

### Image
<img width="1154" height="1050" alt="image" src="https://github.com/user-attachments/assets/444776c3-9400-4a60-8380-39f4bec01920" />

### Code
```mermaid
sequenceDiagram
  autonumber
  actor user as User
  participant app as AgentApplication
  participant manager as AuthorizationManager
  participant handler as AuthorizationHandler
  participant storage as HandlerStorage
  participant client as UserTokenClient

  %% Handlers are configured during app startup (not detailed here)
  Note over app: Handlers are initialized/configured before this flow

  %% 0) User triggers an auth handler route (onMessage '/me')
  user ->> app: onMessage "/me"
  app ->> manager: process(context)

  %% Manager evaluates handlers
  manager ->> storage: read() // active handler session?
  manager ->> handler: signin(context, active?)

  alt First-time auth (no token, no active session)
    %% 1) Show sign-in resource (oAuthCard)
    handler ->> client: getTokenOrSignInResource(...)
    client -->> handler: { signInResource, tokenResponse: undefined }
    handler ->> app: send oAuthCard(signInResource)
  handler ->> storage: write({ activity, handler, attemptsLeft: 2 })
    handler -->> manager: PENDING
  manager -->> app: NOT authorized
    app -->> user: Show sign-in card

    %% 2) User provides magic code (e.g., via Teams verifyState or message)
    user ->> app: Enter 6-digit magic code
    app ->> manager: process(context)
  manager ->> storage: read() // resumes active session
    manager ->> handler: signin(context, active)

    handler ->> handler: verify code (6 digits)
  end

  %% 3) Exchange/Acquire token using magic code
  %% Direct token retrieval (no sign-in card)
  handler ->> client: getTokenOrSignInResource(..., code?)
  client -->> handler: { tokenResponse: token }
  handler ->> app: setContext(token)
  handler -->> manager: APPROVED
  manager ->> storage: delete() // ensure no stale session
  manager -->> app: authorized
  app ->> app: invoke route handler
  app -->> user: Return provider data (e.g., Graph profile)
```