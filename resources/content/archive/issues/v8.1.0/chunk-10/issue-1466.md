---
id: 1466
title: Investigate webpack v5 chunk names
state: CLOSED
labels:
  - discussion
  - stale
assignees: []
createdAt: '2020-11-30T09:57:22Z'
updatedAt: '2024-09-27T02:34:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1466'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:06Z'
---
# Investigate webpack v5 chunk names

It seems to work fine in dist dev & prod, but I noticed that the chunk names in prod are no longer increasing the way they were before. There are pretty big gaps inside the numeric names.

v4:
<img width="211" alt="Screenshot 2020-11-30 at 10 50 22" src="https://user-images.githubusercontent.com/1177434/100594595-2b06a280-32fa-11eb-9dad-16c85192a501.png">

v5:
<img width="232" alt="Screenshot 2020-11-30 at 10 50 47" src="https://user-images.githubusercontent.com/1177434/100594612-30fc8380-32fa-11eb-9e90-88a7a25029c2.png">

It might be intentional and does not cause issues (except slightly longer file names).

Tagging Tobias @sokra to verify.

Tagging @h1b9b as well.

Thx for your input & best regards,
Tobias

## Timeline

- 2020-11-30T09:57:22Z @tobiu added the `discussion` label
### @github-actions - 2024-09-13T02:30:54Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:30:55Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:05Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:06Z @github-actions closed this issue

