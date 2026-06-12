---
id: 668
title: Test if we can use port.addEventListener() after using port.start()
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-05T05:24:50Z'
updatedAt: '2020-06-06T01:25:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/668'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-06T01:25:05Z'
---
# Test if we can use port.addEventListener() after using port.start()

Got the feedback on Reddit that it should work after calling port.start().

This version works without calling start():

```
port.onmessage = me.onMessage.bind(me);
```

This version feels cleaner and more consistent to non shared workers
```
port.addEventListener('message', me.onMessage.bind(me), false);
```

If the change does work, I need to update the tutorial as well.

## Timeline

- 2020-06-05T05:24:50Z @tobiu added the `enhancement` label
- 2020-06-05T05:24:50Z @tobiu assigned to @tobiu
### @tobiu - 2020-06-05T05:38:35Z

just double-checked the specs:

https://html.spec.whatwg.org/multipage/web-messaging.html

![Screenshot 2020-06-05 at 07 37 43](https://user-images.githubusercontent.com/1177434/83840669-77807500-a6ff-11ea-9573-2421af00911e.png)


### @tobiu - 2020-06-06T01:25:05Z

just sticking to `port.onmessage = me.onMessage.bind(me);`.

- 2020-06-06T01:25:05Z @tobiu closed this issue

