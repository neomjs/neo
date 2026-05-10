---
id: 8463
title: Disable Neural Link on GitHub Pages
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T12:28:38Z'
updatedAt: '2026-01-09T12:30:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8463'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T12:30:08Z'
---
# Disable Neural Link on GitHub Pages

The Neural Link (AI Client) currently attempts to connect even when the application is deployed to GitHub Pages, where the WebSocket server is unavailable. This causes unnecessary connection errors.

We need to update the logic in `src/worker/App.mjs` to check the `isGitHubPages` config. If `config.isGitHubPages` is true, the AI Client should not be initialized, regardless of the `useAiClient` setting.

**Current Logic:**
```javascript
if (config.useAiClient) { ... }
```

**Proposed Logic:**
```javascript
if (config.useAiClient && !config.isGitHubPages) { ... }
```

## Timeline

- 2026-01-09T12:28:39Z @tobiu added the `bug` label
- 2026-01-09T12:28:39Z @tobiu added the `ai` label
- 2026-01-09T12:29:14Z @tobiu referenced in commit `3b11b91` - "fix: Disable Neural Link on GitHub Pages (#8463)"
- 2026-01-09T12:29:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T12:29:45Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix. The Neural Link (AI Client) initialization logic in `src/worker/App.mjs` now checks `config.isGitHubPages`. If this flag is true, the client will not attempt to connect, preventing errors in environments without a WebSocket server.
> 
> Commit: 3b11b9181 (#8463)

- 2026-01-09T12:30:08Z @tobiu closed this issue

