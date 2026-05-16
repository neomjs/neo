---
id: 3492
title: 'layout.Flexbox: only apply configs to `wrapperCls` in case there are changes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-10-02T15:39:36Z'
updatedAt: '2022-10-02T15:40:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3492'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-02T15:40:27Z'
---
# layout.Flexbox: only apply configs to `wrapperCls` in case there are changes

this will reduce the `afterSetWrapperCls()` calls by a lot.

when creating a new layout, `container.Base` will trigger:
```
    afterSetLayout(value, oldValue) {
        let me = this;

        if (me.rendered) {
            oldValue.removeRenderAttributes();
            value.applyRenderAttributes();

            me.items.forEach((item, index) => {
                oldValue.removeChildAttributes(item, index);
                value.applyChildAttributes(item, index);
            });
        }
    }
```

=> the initial values will get applied anyway

## Timeline

- 2022-10-02T15:39:36Z @tobiu added the `enhancement` label
- 2022-10-02T15:39:37Z @tobiu assigned to @tobiu
- 2022-10-02T15:40:16Z @tobiu referenced in commit `a5ce7c4` - "layout.Flexbox: only apply configs to wrapperCls in case there are changes #3492"
- 2022-10-02T15:40:27Z @tobiu closed this issue

