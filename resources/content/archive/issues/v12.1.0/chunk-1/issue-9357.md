---
id: 9357
title: Chrome Windows Covid App
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:18:28Z'
updatedAt: '2026-03-07T11:56:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9357'
author: kmunk-klarso
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T11:43:21Z'
---
# Chrome Windows Covid App

<img width="1907" height="925" alt="Image" src="https://github.com/user-attachments/assets/3b10e2e3-7af5-40a2-a0c8-d6b37e476d7e" />

Kacheln enthalten keine Info
Navigationskonzept nicht lesbar, scrollbar funktioniert nicht


## Timeline

- 2026-03-06T09:18:30Z @kmunk-klarso added the `bug` label
- 2026-03-07T11:25:25Z @tobiu assigned to @tobiu
- 2026-03-07T11:41:57Z @tobiu referenced in commit `5f22c4c` - "Fix appThemeFolder resolution for CSS mapping when mapping apps by name (#9357)"
### @tobiu - 2026-03-07T11:43:00Z

**Input from Gemini 3.1 Pro:**

> ✦ Hi @kmunk-klarso, thanks for reporting this!
> 
> The issue was caused by a CSS mapping bug inside the `SharedCovid` app when resolving its `appThemeFolder`. The fix has been pushed to the repository.
> 
> I will go ahead and close this ticket.

### @tobiu - 2026-03-07T11:43:21Z

Completed

- 2026-03-07T11:43:21Z @tobiu closed this issue
- 2026-03-07T11:55:31Z @tobiu referenced in commit `0223407` - "Fix missing windowId for remote method access in shared covid app and gallery component (#9357)"
- 2026-03-07T11:55:31Z @tobiu referenced in commit `474ee0d` - "Fix editRoute inserting windowId into hash by deleting it from the payload (#9357)"
### @tobiu - 2026-03-07T11:56:20Z

**Input from Gemini 3.1 Pro:**

> ✦ Additionally, a bug where the `windowId` was leaking into the URL hash via `editRoute` has been fixed in `src/Main.mjs`.
> 
> As part of fixing the `SharedCovid` warnings, we needed to pass the `windowId` to `editRoute` to avoid deprecation warnings. Since `editRoute` is designed to mutate the browser's URL hash, passing `windowId` caused it to be appended to the URL. The fix ensures that `windowId` is stripped from the payload before the hash is generated.


