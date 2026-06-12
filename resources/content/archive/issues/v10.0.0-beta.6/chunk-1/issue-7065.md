---
id: 7065
title: 'component.Base: destroy() => remove `parentStateProvider?.removeBindings(me.id)`'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T18:00:39Z'
updatedAt: '2025-07-15T18:03:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7065'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T18:03:13Z'
---
# component.Base: destroy() => remove `parentStateProvider?.removeBindings(me.id)`

Obsolete now, since `state.Provider` cleans up binding effects on its own:

```
        // The effect observes the component's destruction to clean itself up.
        me.observeConfig(componentId, 'isDestroying', (value) => {
            if (value) {
                effect.destroy();
                me.#bindingEffects.delete(componentId)
            }
        });
```

## Timeline

- 2025-07-15T18:00:40Z @tobiu assigned to @tobiu
- 2025-07-15T18:00:41Z @tobiu added the `enhancement` label
- 2025-07-15T18:02:45Z @tobiu referenced in commit `b59518a` - "component.Base: destroy() => remove parentStateProvider?.removeBindings(me.id) #7065"
- 2025-07-15T18:03:13Z @tobiu closed this issue

