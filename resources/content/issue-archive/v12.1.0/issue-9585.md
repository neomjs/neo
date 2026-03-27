---
id: 9585
title: 'Bug: LivePreview popout windowUrl generates incorrectly in dist environments'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T14:31:41Z'
updatedAt: '2026-03-27T19:45:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9585'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T15:09:37Z'
---
# Bug: LivePreview popout windowUrl generates incorrectly in dist environments

Resolving the webpack `basePath` against `location.href` inside `dist/development` generates an incorrect absolute URL for `windowUrl` because the AppWorker is only 2 folders deep, whereas the HTML document is 4 folders deep, resulting in a 404 for `MicroLoader.mjs`.

We should return the relative URL directly and allow `window.open` natively to resolve it against the main thread's HTML document path. We also need to use `Neo.windowConfigs?.[this.windowId] || Neo.config` for `basePath` and `useSharedWorkers` instead of reading the global `Neo.config`.

## Timeline

- 2026-03-27T14:31:42Z @tobiu added the `bug` label
- 2026-03-27T14:31:42Z @tobiu added the `ai` label
- 2026-03-27T15:09:37Z @tobiu referenced in commit `12b701f` - "fix(code): Delete beforeSetWindowUrl manual resolution to leverage native browser relative URLs (#9585)"
### @tobiu - 2026-03-27T15:09:38Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Fix implemented natively via commit `12b701ff8`. The manual `beforeSetWindowUrl` string-math logic has been deleted.
> 
> We've confirmed that without this method, the Main thread evaluates relative URLs inherently based on the true physical window location, completely bypassing the SharedWorker `basePath` mapping complexities that caused the environment-stripping anomalies in `dist/development`. Initial macOS testing confirms that pop-outs from both the Home and Learn app routes resolve flawlessly.
> 
> To guarantee no recursive popout regressions or hidden OS edge cases resurface from the original implementation reason (#8074), an expansive review matrix has been scheduled in Analysis Ticket #9586.

- 2026-03-27T15:09:38Z @tobiu closed this issue
- 2026-03-27T19:45:04Z @tobiu assigned to @tobiu

