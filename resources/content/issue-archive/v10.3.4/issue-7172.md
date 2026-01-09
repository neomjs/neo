---
id: 7172
title: 'buildScripts/buildAll: exclude the docs output generation, in case the docs folder is not present'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-09T00:50:21Z'
updatedAt: '2025-08-09T00:50:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7172'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-09T00:50:47Z'
---
# buildScripts/buildAll: exclude the docs output generation, in case the docs folder is not present

* Rationale: a workspace which deletes the entire docs app, most likely does not want a docs output generation by default.
* `npm run generate-docs-json` can still produce it.

## Activity Log

- 2025-08-09 @tobiu assigned to @tobiu
- 2025-08-09 @tobiu added the `enhancement` label
- 2025-08-09 @tobiu referenced in commit `ee0468a` - "buildScripts/buildAll: exclude the docs output generation, in case the docs folder is not present #7172"
- 2025-08-09 @tobiu closed this issue

