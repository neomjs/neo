---
id: 5549
title: 'vdom.Helper: createDeltas() => oldChildNode which exists somewhere inside the new vnode tree edge case'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-07-09T17:31:53Z'
updatedAt: '2024-07-09T18:58:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5549'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-09T18:58:09Z'
---
# vdom.Helper: createDeltas() => oldChildNode which exists somewhere inside the new vnode tree edge case

For the given edge case, we can move the item as needed without(!) triggering further `createDeltas()` calls.

This should be able to resolve a low prio edge-case, where we are still moving items to their same index:

```
        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event', 'foo']},
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: []}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 2, 'Count deltas equals 2');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-1'},
            {cls: {add: ['foo']}, id: 'neo-event-2'}
        ], 'deltas got created successfully');

        t.diag('Revert operation');

        vdom =
        {id: 'neo-calendar-week', cn: [
            {id: 'neo-column-1', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-1', cls: ['neo-event']}
            ]},
            {id: 'neo-column-2', cls: ['neo-c-w-column'], cn: [
                {id: 'neo-event-2', cls: ['neo-event']}
            ]}
        ]};

        output = VdomHelper.update({vdom, vnode}); deltas = output.deltas; vnode = output.vnode;

        t.is(deltas.length, 3, 'Count deltas equals 3');

        t.isDeeplyStrict(deltas, [
            {action: 'moveNode', id: 'neo-event-1', index: 0, parentId: 'neo-column-1'}, // todo: does not hurt, but not needed
            {action: 'moveNode', id: 'neo-event-2', index: 0, parentId: 'neo-column-2'},
            {cls: {remove: ['foo']}, id: 'neo-event-2'}
        ], 'deltas got created successfully');
```

## Timeline

- 2024-07-09T17:31:53Z @tobiu added the `enhancement` label
- 2024-07-09T18:57:44Z @tobiu referenced in commit `1eb368f` - "vdom.Helper: createDeltas() => oldChildNode which exists somewhere inside the new vnode tree edge case #5549"
### @tobiu - 2024-07-09T18:58:09Z

A pretty complex change, but it did reduce the amount of deltas from 3 to 2.

- 2024-07-09T18:58:09Z @tobiu closed this issue

