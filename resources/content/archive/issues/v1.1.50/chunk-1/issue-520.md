---
id: 520
title: 'buildScripts: jsdocx => add logs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-01T10:01:02Z'
updatedAt: '2020-05-01T10:36:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/520'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-01T10:36:00Z'
---
# buildScripts: jsdocx => add logs

this script can take a long time. it makes sense to add some progress logs, like which class is getting parsed.

## Timeline

- 2020-05-01T10:01:02Z @tobiu added the `enhancement` label
- 2020-05-01T10:01:02Z @tobiu assigned to @tobiu
- 2020-05-01T10:32:39Z @tobiu referenced in commit `309425f` - "buildScripts: jsdocx => add logs #520"
### @tobiu - 2020-05-01T10:36:00Z

not exactly sure on this one.

added timing logs:

> Start default jsdocx parsing.
> Default jsdocx parsing done.
> jsdocx default parsing time: 141.39s
> jsdocx custom parsing time: 0.10s

=> progress logs make no sense, since it is entirely the default parsing.

this one was a **lot** faster in the past. not sure if this is related to neo growing or an jsdocx update. will create a follow up ticket.

- 2020-05-01T10:36:00Z @tobiu closed this issue
- 2020-05-01T10:37:23Z @tobiu cross-referenced by #521

