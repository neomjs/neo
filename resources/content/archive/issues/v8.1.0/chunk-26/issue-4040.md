---
id: 4040
title: 'component.Base: show() with hideMode: ''removeDom'''
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-12T21:52:11Z'
updatedAt: '2023-02-12T22:48:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4040'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-12T22:48:38Z'
---
# component.Base: show() with hideMode: 'removeDom'

i tested this on various scenarios e.g. `examples.button.split` to hide a trigger and it did not work for me.

`removeDom` relies a bit on toggling on / off for child nodes. in case we want the `root` though, we would most likely need to trigger an update on the parent component, in case it exists.

the probably easier way which should work is using `render(true)` instead of `update()`.

@Dinkh can you please double-check this change. Especially on your own apps in case you are not using a different hideMode there.

thx!

## Timeline

- 2023-02-12T21:52:12Z @tobiu added the `bug` label
- 2023-02-12T21:52:12Z @tobiu assigned to @tobiu
- 2023-02-12T21:52:59Z @tobiu referenced in commit `a393c75` - "component.Base: show() with hideMode: 'removeDom' #4040"
### @tobiu - 2023-02-12T21:53:50Z

closing the ticket. we can definitely re-open it in case this is needed.

- 2023-02-12T21:53:50Z @tobiu closed this issue
### @tobiu - 2023-02-12T22:47:59Z

well, i did forget the "silent mode".

- 2023-02-12T22:47:59Z @tobiu reopened this issue
- 2023-02-12T22:48:34Z @tobiu referenced in commit `67b49f5` - "#4040 do not re-mount in silent mode"
- 2023-02-12T22:48:38Z @tobiu closed this issue

