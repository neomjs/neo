---
id: 8366
title: Fix deprecated destination warning for registerRemote messages
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-06T20:10:00Z'
updatedAt: '2026-01-06T20:16:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8366'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T20:16:37Z'
---
# Fix deprecated destination warning for registerRemote messages

The `registerRemote` message logic triggers a console warning ("sendMessage destination 'main' is deprecated") in SharedWorker environments because it correctly targets the 'main' destination for initial registration.

This deprecation warning should be suppressed specifically for `registerRemote` actions, as they are intended to be broadcast-like or generic in this context.

**Changes:**
- Update `src/worker/Base.mjs`: `sendMessage()` to check `opts.action !== 'registerRemote'` before warning.

## Timeline

- 2026-01-06T20:10:01Z @tobiu added the `bug` label
- 2026-01-06T20:10:01Z @tobiu added the `ai` label
- 2026-01-06T20:10:01Z @tobiu added the `core` label
- 2026-01-06T20:16:26Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-06T20:16:38Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix.
> 
> **Changes:**
> - Suppressed the deprecation warning in `src/worker/Base.mjs` when `action === 'registerRemote'`.
> - This treats `registerRemote` to `main` as a valid "System Broadcast" in SharedWorker environments, which `worker.Base` correctly replays to all connecting windows.
> 
> Commit: `2f6e49458`

- 2026-01-06T20:16:38Z @tobiu closed this issue
- 2026-01-07T13:25:09Z @jonnyamsp referenced in commit `2f6e494` - "Fix deprecated destination warning for registerRemote messages

In SharedWorker environments, sending messages to 'main' is deprecated
due to ambiguity (multiple connected windows). However, `registerRemote`
calls originate from `core.Base` (often singletons) which generally
target the "Main Thread Realm" rather than a specific window.

These registration messages are intercepted by `worker.Base` and
replayed to all connected Main Thread ports. Therefore, using 'main'
as the destination acts as a broadcast signal in this specific context.

We now suppress the deprecation warning for `action: 'registerRemote'`
to treat it as a valid system-wide broadcast.

Resolves #8366"

