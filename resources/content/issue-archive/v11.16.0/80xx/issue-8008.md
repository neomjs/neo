---
id: 8008
title: Create Neural Link Testbed App
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-12-03T09:56:26Z'
updatedAt: '2025-12-03T14:09:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8008'
author: tobiu
commentsCount: 1
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T14:09:15Z'
---
# Create Neural Link Testbed App

**Goal:** Create a minimal Neo.mjs app to test the Neural Link connection.

**Requirements:**
1.  **App Structure:** Create `apps/ai/neural-link/`.
2.  **Entry Point:** Implement `app.mjs` using `Neo.app` and `Viewport`.
3.  **View:** Implement `view/Viewport.mjs` with a "Ping Agent" button and log output area.
4.  **Configuration:** Create `neo-config.json` with `"useAiClient": true`.
5.  **Loader:** Update `index.html` to use `MicroLoader.mjs`.

## Timeline

- 2025-12-03T09:56:27Z @tobiu added the `enhancement` label
- 2025-12-03T09:56:27Z @tobiu added the `ai` label
- 2025-12-03T09:56:28Z @tobiu added the `testing` label
### @tobiu - 2025-12-03T10:16:50Z

**Input from Antigravity:**

> ◆ **CORRECTION: Naming Refinement**
> 
> 1.  **Folder Name**: The app will be located at **`apps/ai/neural-link`** (kebab-case) to comply with project standards.
> 2.  **Config**: It will use `useAiClient: true`.
> 

- 2025-12-03T14:06:57Z @tobiu assigned to @tobiu
- 2025-12-03T14:07:13Z @tobiu added parent issue #7960
- 2025-12-03T14:09:08Z @tobiu referenced in commit `e152fad` - "Create Neural Link Testbed App #8008"
- 2025-12-03T14:09:15Z @tobiu closed this issue
- 2025-12-03T14:10:56Z @tobiu referenced in commit `cc7678f` - "#8008 config fix"
- 2025-12-03T21:47:11Z @tobiu cross-referenced by #8004

