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


## Comments

### @tobiu - 2025-12-21 21:15

Fixed in commit 11b1fd19b: synced .npmignore with .gitignore

## Activity Log

- 2025-12-21 @tobiu added the `bug` label
- 2025-12-21 @tobiu added the `ai` label
- 2025-12-21 @tobiu assigned to @tobiu
- 2025-12-21 @tobiu referenced in commit `11b1fd1` - "sync .npmignore with .gitignore #8154"
- 2025-12-21 @tobiu closed this issue

