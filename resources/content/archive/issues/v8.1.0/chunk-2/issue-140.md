---
id: 140
title: 'Docs app: dist dev&prod examples (webpack chunks)'
state: CLOSED
labels:
  - documentation
  - enhancement
  - help wanted
  - stale
assignees: []
createdAt: '2019-12-02T10:54:44Z'
updatedAt: '2024-09-29T02:38:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/140'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:38:35Z'
---
# Docs app: dist dev&prod examples (webpack chunks)

This is a rather tricky webpack build chunking issue.
Since I am no expert on webpack, help on this one would be appreciated.

In short:
The non dist version dynamically imports (lazy loads) each example app as soon as you want to view it. To make this work for the dist versions, webpack needs to be aware of the chunking. Meaning: it must be guaranteed, that each example app only requires the modules which are not already there and by default webpack tends to create multiple modules for the same base classes (e.g. more than 1 IdGenerator class is a big problem).

## Timeline

- 2019-12-02T10:54:44Z @tobiu added the `documentation` label
- 2019-12-02T10:54:44Z @tobiu added the `enhancement` label
- 2019-12-02T10:54:44Z @tobiu added the `help wanted` label
- 2019-12-02T10:56:02Z @tobiu referenced in commit `c86776e` - "Docs app: disable the examples tab for dist versions until #140 is resolved."
- 2019-12-02T10:57:28Z @tobiu referenced in commit `6c2c1c8` - "#140 comment update"
### @github-actions - 2024-09-14T02:28:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:14Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:38:35Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:38:35Z @github-actions closed this issue

