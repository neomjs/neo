---
id: 6696
title: 'container.Base: afterSetLayout()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-05T13:43:23Z'
updatedAt: '2025-05-05T17:22:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6696'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 6697
  - 6698
  - 6699
  - 6700
  - 6701
  - 6702
subIssuesCompleted: 6
subIssuesTotal: 6
blockedBy: []
blocking: []
closedAt: '2025-05-05T17:22:36Z'
---
# container.Base: afterSetLayout()

so far, `container.Base` is using:
```
afterSetLayout(value, oldValue) {
    let me = this;

    if (me.rendered) {
        oldValue?.removeRenderAttributes();
        value?.applyRenderAttributes();

        me.items.forEach((item, index) => {
            oldValue?.removeChildAttributes(item, index);
            value?.applyChildAttributes(item, index)
        })
    }

    oldValue?.destroy?.()
}
```

* There should just be one layout method call (layouts can iterate over items internally)
* The cube layout contains logic on destruction, which happens after new layout child attributes got applied). this worked in v8, but breaks for card to cube changes in v9

## Activity Log

- 2025-05-05 @tobiu assigned to @tobiu
- 2025-05-05 @tobiu added the `enhancement` label
- 2025-05-05 @tobiu closed this issue

