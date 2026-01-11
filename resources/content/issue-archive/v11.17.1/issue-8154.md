---
id: 8154
title: Sync .npmignore with .gitignore (agentos & legit apps)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-21T21:10:56Z'
updatedAt: '2025-12-21T21:15:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8154'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-21T21:15:43Z'
---
# Sync .npmignore with .gitignore (agentos & legit apps)

The `.npmignore` file is out of sync with `.gitignore` regarding recent app additions.
We need to ensure the following apps are whitelisted in the npm package:
- `apps/agentos`
- `apps/legit`
- `apps/ai/neural-link`

Also, we should remove outdated entries like `apps/krausest` and update the local AI knowledge base paths to match `.gitignore`.


## Timeline

- 2025-12-21T21:10:57Z @tobiu added the `bug` label
- 2025-12-21T21:10:57Z @tobiu added the `ai` label
- 2025-12-21T21:13:10Z @tobiu assigned to @tobiu
- 2025-12-21T21:13:52Z @tobiu referenced in commit `11b1fd1` - "sync .npmignore with .gitignore #8154"
### @tobiu - 2025-12-21T21:15:43Z

Fixed in commit 11b1fd19b: synced .npmignore with .gitignore

- 2025-12-21T21:15:43Z @tobiu closed this issue

