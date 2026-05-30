---
id: 1136
title: 'worker.Base: onMessage() => remove the try catch block'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-27T14:16:37Z'
updatedAt: '2020-08-27T14:27:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1136'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-27T14:27:35Z'
---
# worker.Base: onMessage() => remove the try catch block

```
    onMessage(e) {
        let me      = this,
            data    = e.data,
            action  = data.action,
            replyId = data.replyId,
            promise;

        if (!action) {
            throw new Error('Message action is missing: ' + data.id);
        }

        if (action !== 'reply') {
            try {
                this['on' + Neo.capitalize(action)](data);
            } catch(err) {
                console.log('error', data, err, e);

                this.reject(data.id, {
                    error : err.message
                });
            }
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            if (data.reject) {
                promise.reject(data.data);
            } else {
                promise.resolve(data.data);
            }

            delete me.promises[replyId];
        }
    }
```

the try check was from a time, where errors inside a worker did not get logged inside the chrome devtools.

it should be safe to just remove it:

```
    onMessage(e) {
        let me      = this,
            data    = e.data,
            action  = data.action,
            replyId = data.replyId,
            promise;

        if (!action) {
            throw new Error('Message action is missing: ' + data.id);
        }

        if (action !== 'reply') {
            me['on' + Neo.capitalize(action)](data);
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            if (data.reject) {
                promise.reject(data.data);
            } else {
                promise.resolve(data.data);
            }

            delete me.promises[replyId];
        }
    }
```

## Timeline

- 2020-08-27T14:16:37Z @tobiu added the `enhancement` label
- 2020-08-27T14:16:37Z @tobiu assigned to @tobiu
- 2020-08-27T14:19:44Z @tobiu referenced in commit `f861e67` - "worker.Base: onMessage() => remove the try catch block #1136"
- 2020-08-27T14:27:35Z @tobiu closed this issue

