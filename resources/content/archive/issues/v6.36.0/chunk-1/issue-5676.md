---
id: 5676
title: 'component.Video: handleAutoplay() => redundant update() call'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2024-08-03T18:40:47Z'
updatedAt: '2024-08-10T16:22:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5676'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-10T16:22:31Z'
---
# component.Video: handleAutoplay() => redundant update() call

If I see it correctly, `handleAutoplay()` only gets called inside `construct()`. If so, the method needs the `@protected` flag.

It is using `this.update()` before changing the value of the playing config, which itself also triggers an `update()` call.

We really want to batch all changes into one `update()` call instead => removing it inside `handleAutoplay()` would be sufficient.

Rationale: `update()` sends the vdom & vnode on a workers roundtrip to get the deltas. While this is happening, the component locks itself for future updates until the new vnode got back (async). After the delay the framework would trigger a 2nd roundtrip to get the deltas for the visible node.

## Timeline

- 2024-08-03T18:40:47Z @tobiu added the `bug` label
- 2024-08-03T18:40:47Z @tobiu assigned to @Dinkh
### @Dinkh - 2024-08-10T16:22:31Z

understood and fixed

- 2024-08-10T16:22:31Z @Dinkh closed this issue

