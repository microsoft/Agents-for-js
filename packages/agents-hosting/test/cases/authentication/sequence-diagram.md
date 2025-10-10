# Sequence Diagram

This diagram shows the normal guarded route flow: app initializes routing, applies an AuthorizationGuard, shows an OAuth card and handles the magic code on first access, then proceeds directly on subsequent signed-in turns; the route handler runs only when not guarded.

### Editing tool
[https://www.mermaidchart.com/app/dashboard](https://www.mermaidchart.com/app/dashboard)

### Image
<img width="1243" height="1129" alt="image" src="https://github.com/user-attachments/assets/c1dfb908-9f3a-403b-b77c-02898dbcea4e" />

### Code
```mermaid
sequenceDiagram
  autonumber
  actor user as User
  participant app as AgentApplication
  participant manager as RouteManager
  participant guard as AuthorizationGuard
  participant storage as GuardStorage
  participant client as UserTokenClient

  %% Guards are configured during app startup (not detailed here)
  Note over app: Guards are initialized/configured before this flow

  %% 0) User triggers a guarded route (onMessage '/me')
  user ->> app: onMessage "/me"
  app ->> manager: initialize(routes, context)

  %% Manager evaluates guards for the route
  app ->> manager: guarded()
  manager ->> storage: read() // active guard session?
  manager ->> guard: register({ context, active? })

  alt First-time auth (no token, no active session)
    %% 1) Show sign-in resource (oAuthCard)
    guard ->> client: getTokenOrSignInResource(...)
    client -->> guard: { signInResource, tokenResponse: undefined }
    guard ->> app: send oAuthCard(signInResource)
    guard ->> storage: write({ activity, guard, attemptsLeft: 3 })
    guard -->> manager: PENDING
    manager -->> app: true (request is guarded)
    app -->> user: Show sign-in card

    %% 2) User provides magic code (e.g., via Teams verifyState or message)
    user ->> app: Enter 6-digit magic code
    app ->> manager: guarded()
    manager ->> storage: read() // resumes active session
    manager ->> guard: register({ context, active })

    guard ->> guard: verify code (6 digits)
  end

  %% 3) Exchange/Acquire token using magic code
  %% Direct token retrieval (no sign-in card)
  guard ->> client: getTokenOrSignInResource(..., code?)
  client -->> guard: { tokenResponse: token }
  guard ->> app: setContext(token)
  guard -->> manager: APPROVED
  manager ->> storage: delete() // ensure no stale session
  manager -->> app: false (not guarded)
  app ->> manager: handler(state)
  manager ->> app: invoke route handler
  app -->> user: Return provider data (e.g., Graph profile)
```