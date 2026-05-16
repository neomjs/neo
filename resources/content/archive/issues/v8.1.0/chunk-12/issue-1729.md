---
id: 1729
title: 'form.field.Text: it is not possible to use arrow keys (left & right) to change the cursor position'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-04-06T18:18:07Z'
updatedAt: '2021-04-06T18:22:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1729'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-06T18:22:54Z'
---
# form.field.Text: it is not possible to use arrow keys (left & right) to change the cursor position

this is related to main.DomEvents:

```
/**
 *
 * @param {Object} event
 */
onKeyDown(event) {
    this.sendMessageToApp(this.getKeyboardEventData(event));

    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
    }
}
```


Selection models have pretty bad side effects in case the keydown event is not disabled. The Browser tries to scroll DOM nodes into the visible area in case they receive focus, which is colliding with the internal scroll logic.

If I remember it right, the helix had problems as well.

However, input nodes need the event, otherwise you can not navigate.

I am not 100% sure if we should enable or disable specific targets.

For now, I will enable the keypress default event handling for input fields only. Please add a comment in case we need other targets as well or switch the behavior.

## Timeline

- 2021-04-06T18:18:07Z @tobiu added the `bug` label
- 2021-04-06T18:18:07Z @tobiu assigned to @tobiu
- 2021-04-06T18:20:06Z @tobiu referenced in commit `a242316` - "form.field.Text: it is not possible to use arrow keys (left & right) to change the cursor position #1729"
- 2021-04-06T18:22:54Z @tobiu closed this issue
- 2024-08-13T20:08:31Z @tobiu cross-referenced by #5755

