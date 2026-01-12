---
id: 6690
title: 'tab.Container: createItems() => override insert() & remove() for the content container'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-02T20:57:01Z'
updatedAt: '2025-05-02T20:57:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6690'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-02T20:57:56Z'
---
# tab.Container: createItems() => override insert() & remove() for the content container

* it would be cleaner to create a separate class for it
* in case we add or remove an item to the content container and the item qualifies as a tab, it should delegate the call to the tab container itself (also adjusting the header)

## Timeline

- 2025-05-02T20:57:01Z @tobiu added the `enhancement` label
- 2025-05-02T20:57:01Z @tobiu assigned to @tobiu
- 2025-05-02T20:57:51Z @tobiu referenced in commit `202010d` - "tab.Container: createItems() => override insert() & remove() for the content container #6690"
- 2025-05-02T20:57:56Z @tobiu closed this issue
- 2025-06-09T10:24:30Z @tobiu cross-referenced by #6760

