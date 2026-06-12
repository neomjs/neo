---
id: 1128
title: 'Refactoring: component.Button => button.Base'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-24T06:30:46Z'
updatedAt: '2020-08-24T07:06:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1128'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-24T07:06:41Z'
---
# Refactoring: component.Button => button.Base

makes sense now, since we want to add button.Split & button.Menu.

## Timeline

- 2020-08-24T06:30:46Z @tobiu added the `enhancement` label
- 2020-08-24T06:30:46Z @tobiu assigned to @tobiu
- 2020-08-24T06:33:42Z @tobiu referenced in commit `7913e11` - "Refactoring: component.Button => button.Base #1128"
- 2020-08-24T06:35:28Z @tobiu referenced in commit `4088edc` - "#1128 button.Split => extending button.Base"
- 2020-08-24T06:38:51Z @tobiu referenced in commit `ff79ad9` - "#1128 replaced component.Button with button.Base inside the src folder"
- 2020-08-24T06:40:43Z @tobiu referenced in commit `fc5c648` - "#1128 replaced component.Button with button.Base inside the examples folder"
- 2020-08-24T06:47:49Z @tobiu referenced in commit `eb1c82f` - "#1128 examples cleanup"
- 2020-08-24T06:50:24Z @tobiu referenced in commit `23ff790` - "#1128 adjusted the build scripts & button entrypoint"
- 2020-08-24T06:52:21Z @tobiu referenced in commit `562e64d` - "#1128 docs app (import, new button example location)"
- 2020-08-24T06:56:19Z @tobiu referenced in commit `c314281` - "#1128 src folder => cleanup (ide auto-replacement mess. (. VS / )"
- 2020-08-24T07:02:16Z @tobiu referenced in commit `fcb6b11` - "#1128 scss"
### @tobiu - 2020-08-24T07:06:41Z

done. once we update the sub repos, we need to ensure to copy the latest code base or adjust it there manually.

- 2020-08-24T07:06:41Z @tobiu closed this issue

