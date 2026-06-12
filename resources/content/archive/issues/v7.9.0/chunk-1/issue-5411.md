---
id: 5411
title: Add support for AmCharts version 5
state: CLOSED
labels:
  - enhancement
  - epic
  - stale
assignees:
  - tobiu
createdAt: '2024-06-07T12:33:26Z'
updatedAt: '2024-09-25T02:34:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5411'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-25T02:34:57Z'
---
# Add support for AmCharts version 5

Currently, our main thread addon is limited to v4, which is quite outdated at this point.

v5 has several breaking changes, so it would be close to a rewrite.

Sadly, we can not use the library inside a worker yet. While we can move the ownership of a canvas node directly to our canvas worker, their `root` logic seems to require a div: https://www.amcharts.com/docs/v5/getting-started/root-element/

On top, there is most likely no ES version with relative import paths.

I will double check this.

## Timeline

- 2024-06-07T12:33:26Z @tobiu added the `enhancement` label
- 2024-06-07T12:33:26Z @tobiu added the `epic` label
- 2024-06-07T12:33:27Z @tobiu assigned to @tobiu
- 2024-06-07T12:40:54Z @tobiu cross-referenced by #1562
### @github-actions - 2024-09-11T02:26:57Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-11T02:26:57Z @github-actions added the `stale` label
### @github-actions - 2024-09-25T02:34:57Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-25T02:34:57Z @github-actions closed this issue

