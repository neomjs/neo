---
id: 6811
title: 'worker.mixin.RemoteMethodAccess: onRemoteMethod() => log errors for async function calls into the console'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-16T10:55:09Z'
updatedAt: '2025-06-16T10:56:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6811'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-16T10:56:45Z'
---
# worker.mixin.RemoteMethodAccess: onRemoteMethod() => log errors for async function calls into the console

```
        if (out instanceof Promise) {
            out
                /*
                 * Intended logic:
                 * If the code of a remote method fails, it would not show any errors inside the console,
                 * so we want to manually log the error for debugging.
                 * Rejecting the Promise gives us the chance to recover.
                 *
                 * Example:
                 * Neo.vdom.Helper.update(opts).catch(err => {
                 *     me.isVdomUpdating = false;
                 *     reject?.()
                 * }).then(data => {...})
                 */
                .catch(err => {console.error(err); me.reject(msg, err)})
                .then(data => {me.resolve(msg, data)})
        } else {
            me.resolve(msg, out)
        }
```

## Timeline

- 2025-06-16T10:55:09Z @tobiu assigned to @tobiu
- 2025-06-16T10:55:10Z @tobiu added the `enhancement` label
- 2025-06-16T10:56:16Z @tobiu referenced in commit `1afddb7` - "worker.mixin.RemoteMethodAccess: onRemoteMethod() => log errors for async function calls into the console #6811"
- 2025-06-16T10:56:45Z @tobiu closed this issue

