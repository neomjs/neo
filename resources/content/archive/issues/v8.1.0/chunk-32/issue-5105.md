---
id: 5105
title: dev dependencies VS hard dependencies cleanup
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-11-27T09:53:00Z'
updatedAt: '2023-11-27T13:35:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5105'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-11-27T13:35:55Z'
---
# dev dependencies VS hard dependencies cleanup

I originally added most dev dependencies inside the package.json as real dependencies, since workspaces (app repos) rely on using the same build tools. a bit more convenient, since we did not have to add them again.

However, tools like sonar will create alerts, security warnings & code smells for code which is only required for build processes. Whitelisting all errors is too much work.

So, we should move everything possible into `devDependencies` and also adjust `npx neo-app` to include them for new workspaces the same way.

## Timeline

- 2023-11-27T09:53:00Z @tobiu added the `enhancement` label
- 2023-11-27T09:53:01Z @tobiu assigned to @tobiu
- 2023-11-27T13:35:33Z @tobiu referenced in commit `a853507` - "dev dependencies VS hard dependencies cleanup #5105"
- 2023-11-27T13:35:55Z @tobiu closed this issue

