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
  - '[x] 6697 layout.Base: applyRenderAttributes() => should trigger applyChildAttributes() internally'
  - '[x] 6698 layout.Base: removeRenderAttributes() => should trigger removeChildAttributes() internally'
  - '[x] 6699 layout.Cube: destroy() => move the transformation logic into removeRenderAttributes()'
  - '[x] 6700 Portal.view.ViewportController: setMainContentIndex() => only use the first timeout for cube layout switches'
  - '[x] 6701 layout.Base: applyRenderAttributes() => add a silent param'
  - '[x] 6702 layout.Cube: getPlaneId()'
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

## Timeline

- 2025-05-05T13:43:23Z @tobiu assigned to @tobiu
- 2025-05-05T13:43:25Z @tobiu added the `enhancement` label
- 2025-05-05T13:44:39Z @tobiu added sub-issue #6697
- 2025-05-05T13:45:13Z @tobiu added sub-issue #6698
- 2025-05-05T14:07:51Z @tobiu added sub-issue #6699
- 2025-05-05T14:17:42Z @tobiu added sub-issue #6700
- 2025-05-05T16:54:09Z @tobiu added sub-issue #6701
- 2025-05-05T17:19:59Z @tobiu added sub-issue #6702
- 2025-05-05T17:22:36Z @tobiu closed this issue

