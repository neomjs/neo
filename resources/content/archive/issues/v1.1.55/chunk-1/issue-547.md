---
id: 547
title: merge main.lib & main.addon
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-16T18:27:26Z'
updatedAt: '2020-05-18T10:49:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/547'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-18T10:49:55Z'
---
# merge main.lib & main.addon

each file in lib can get converted into an addon now.

they were treated differently, since the current addons were DomAccess mixins at first and partly required other DomAccess related logic. with the new import logic this should no longer be a problem plus we can most likely move the inclusion of the addons from DomAccess to main now.

On it!

## Timeline

- 2020-05-16T18:27:26Z @tobiu added the `enhancement` label
- 2020-05-16T18:27:27Z @tobiu assigned to @tobiu
- 2020-05-16T19:05:51Z @tobiu referenced in commit `9de25be` - "merge main.lib & main.addon #547"
- 2020-05-16T19:09:41Z @tobiu referenced in commit `91074b6` - "merge main.lib & main.addon #547 => removed the f** webstorm auto imports"
- 2020-05-18T10:49:55Z @tobiu closed this issue

