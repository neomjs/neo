---
id: 1318
title: 'tree.List: smarter check if draggable & sortable are set to true'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-26T13:09:35Z'
updatedAt: '2020-10-26T13:12:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1318'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-26T13:12:56Z'
---
# tree.List: smarter check if draggable & sortable are set to true

Since we can dynamically both configs at any point, a ctor based check like this is not sufficient:

```
/**
 *
 * @param config
 */
constructor(config) {
    super(config);

    let me = this;

    if (me.draggable && me.sortable) {
        console.error('tree.List can be either draggable or sortable, not both.', me.id);
    }
}
```

I will move the check into afterSetDraggable() & afterSetSortable() instead.

## Timeline

- 2020-10-26T13:09:35Z @tobiu added the `enhancement` label
- 2020-10-26T13:09:36Z @tobiu assigned to @tobiu
- 2020-10-26T13:12:53Z @tobiu referenced in commit `a1db4e8` - "tree.List: smarter check if draggable & sortable are set to true #1318"
- 2020-10-26T13:12:56Z @tobiu closed this issue

