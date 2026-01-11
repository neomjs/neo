---
id: 6760
title: 'tab.Container: remove the tab body inline overrides'
state: CLOSED
labels:
  - bug
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-09T10:24:29Z'
updatedAt: '2025-06-09T10:46:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6760'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-09T10:46:39Z'
---
# tab.Container: remove the tab body inline overrides

Bugreport & feature request combined.

it looks like https://github.com/neomjs/neo/issues/6690 broke the docs app:

<img width="1394" alt="Image" src="https://github.com/user-attachments/assets/eeb39be7-a11e-41b8-b505-05567b98768e" />

let us resolve the inline method overrides with a new class, cleaner anyway.

## Timeline

- 2025-06-09T10:24:29Z @tobiu assigned to @tobiu
- 2025-06-09T10:24:30Z @tobiu added the `bug` label
- 2025-06-09T10:24:31Z @tobiu added the `enhancement` label
### @tobiu - 2025-06-09T10:42:24Z

thinking more about it: the methods only provide a minor DX enhancement, if someone would by accident add a tab to the body child container. since this quite unlikely, better just remove the overrides completely.

- 2025-06-09T10:42:58Z @tobiu changed title from **Neo.tab.BodyContainer** to **tab.Container: remove the tab body inline overrides**
- 2025-06-09T10:43:32Z @tobiu referenced in commit `0986565` - "tab.Container: remove the tab body inline overrides #6760"
- 2025-06-09T10:46:39Z @tobiu closed this issue

