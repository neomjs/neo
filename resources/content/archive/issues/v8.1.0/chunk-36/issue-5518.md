---
id: 5518
title: 'vdom.Helper: createDeltas() => add support for replacing a node with an array of child nodes'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-03T13:59:29Z'
updatedAt: '2024-07-03T17:23:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5518'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-03T17:23:15Z'
---
# vdom.Helper: createDeltas() => add support for replacing a node with an array of child nodes

This is a mix of a bug report and a feature request.

The engine can handle moving a child node upwards inside the DOM tree => replacing a parent.

example:

old tree:
```
div id="level-1"
    div id="level-2"
        div id="level-3"
```

new tree:
```
div id="level-1"
    div id="level-3"
```

In this case we get a delta telling "level-3" to replace "level-2". all good.

What does not work:
old tree:
```
div id="level-1"
    div id="level-2"
        div id="level-3-1"
        div id="level-3-2"
```

new tree:
```
div id="level-1"
    div id="level-3-1"
    div id="level-3-2"
```

In this case we get the same delta as before: "level-3-1" will replace "level-2" and all other siblings "level-3-x" will get lost.

The desired output would be to move all "level-3-x" nodes into the parentNode "level-1" and then delete the node "level-2".

We need it for `layout.Cube`, in case we want to switch the owner container to a different layout (e.g. VBox). We might need this one for the Portal App.

I will write a breaking Siesta Test first, then take a look into the engine. If there is not an easy (and not too expensive performance wise) way to fix it, I will do it.

Otherwise we could manually create the desired deltas.

## Timeline

- 2024-07-03T13:59:29Z @tobiu added the `bug` label
- 2024-07-03T13:59:30Z @tobiu assigned to @tobiu
- 2024-07-03T15:20:30Z @tobiu referenced in commit `7ed8782` - "#5518 Siesta test cases:
1. replacing a node with 1 child (works)
2. replacing a node with 2+ children (breaks)"
- 2024-07-03T15:33:35Z @tobiu cross-referenced by #5517
- 2024-07-03T16:25:07Z @tobiu referenced in commit `5cda40c` - "vdom.Helper: createDeltas() => add support for replacing a node with an array of child nodes #5518"
- 2024-07-03T17:23:01Z @tobiu referenced in commit `1bbb0fd` - "#5518
1. Test: Replacing a parent node with multiple children & adding a new node
2. Adjusting vdom.Helper to match it"
### @tobiu - 2024-07-03T17:23:16Z

![Screenshot 2024-07-03 at 19 22 52](https://github.com/neomjs/neo/assets/1177434/0963525c-ac3a-49e2-8518-a79b0d641aa7)


- 2024-07-03T17:23:16Z @tobiu closed this issue

