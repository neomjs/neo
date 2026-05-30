---
id: 347
title: 'main.DomEvents: keydown => preventDefault prevents opening the dev tools via shortcut'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-03-19T23:30:02Z'
updatedAt: '2020-03-19T23:33:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/347'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-19T23:33:46Z'
---
# main.DomEvents: keydown => preventDefault prevents opening the dev tools via shortcut

limit the preventDefault() to arrow keys

## Timeline

- 2020-03-19T23:30:02Z @tobiu added the `bug` label
- 2020-03-19T23:30:02Z @tobiu assigned to @tobiu
- 2020-03-19T23:33:22Z @tobiu referenced in commit `0a5cb96` - "main.DomEvents: keydown => preventDefault prevents opening the dev tools via shortcut #347"
### @tobiu - 2020-03-19T23:33:46Z

```
    onKeyDown(event) {
        this.sendMessageToApp(this.getKeyboardEventData(event));

        if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
        }
    }
```

- 2020-03-19T23:33:46Z @tobiu closed this issue

