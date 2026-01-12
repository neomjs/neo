---
id: 7115
title: 'Neo.selection.Model: add getController()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-27T00:22:34Z'
updatedAt: '2025-10-22T22:58:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7115'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-27T00:24:21Z'
---
# Neo.selection.Model: add getController()

Use case are selectionModel based listeners, which should get mapped to view controllers:

```javascript
{
    module: ComponentTreeList,
    header: {
        text: 'Components'
    },
    selectionModel: {
        listeners: {
            selectionChange: 'onComponentTreeListSelectionChange'
        }
    }
}
```

this leads to `util.Function`:

```javascript
export function resolveCallback(fn, scope=this) {
    if (Neo.isString(fn)) {
        if (!scope[fn] && fn.startsWith('up.')) {
            fn = fn.slice(3);
            while (!scope[fn] && (scope = scope.parent));
        } else {
            scope = scope.getController?.()?.getHandlerScope(fn, null) || scope
        }

        fn = scope[fn]
    }

    return {fn, scope}
}
```

the SM must try to pass a matching view controller.

@gplanansky

## Timeline

- 2025-07-27T00:22:36Z @tobiu added the `enhancement` label
- 2025-07-27T00:24:09Z @tobiu referenced in commit `d5dec95` - "Neo.selection.Model: add getController() #7115"
- 2025-07-27T00:24:22Z @tobiu closed this issue

