---
id: 4067
title: Return the correct status code in the build process
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-02-17T19:57:58Z'
updatedAt: '2023-02-17T21:26:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4067'
author: deniztoprak
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-17T21:26:51Z'
---
# Return the correct status code in the build process

The build scripts return always 0 as status code. This causes a misalignment in the CI/CD process when a child process in the build scripts fails. The pipeline succeeds even if the scripts crashes for any reason. The scripts should return an accurate status code which combines the status of all executed child processes.

## Timeline

- 2023-02-17T19:57:58Z @deniztoprak added the `bug` label
- 2023-02-17T20:05:54Z @deniztoprak cross-referenced by PR #4068
- 2023-02-17T20:09:36Z @deniztoprak changed title from **Return the right status code in the build process** to **Return the correct status code in the build process**
- 2023-02-17T21:26:51Z @tobiu closed this issue
- 2023-02-19T21:04:34Z @deniztoprak cross-referenced by PR #4072
- 2023-02-19T21:42:54Z @tobiu referenced in commit `769c57d` - "Merge pull request #4072 from deniztoprak/build_optimization

fix #4067"

