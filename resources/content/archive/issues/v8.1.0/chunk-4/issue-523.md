---
id: 523
title: 'HtmlWebpackPlugin: include main chunk'
state: CLOSED
labels:
  - bug
  - help wanted
assignees:
  - tobiu
createdAt: '2020-05-01T12:52:32Z'
updatedAt: '2020-05-01T16:06:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/523'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-01T16:06:28Z'
---
# HtmlWebpackPlugin: include main chunk

This worked perfectly fine before separating the main thread build from the workers.

Example:
```
new HtmlWebpackPlugin({
    chunks  : ['main'],
    // ...
});
```

The index files need to get created in the examples or app build scripts.

These scripts are no longer aware of the main thread chunk.

I see 2 options:
1. Manually adding the main chunk into each index file (adjusting the templates => index.ejs)
2. Evaluating where webpack stores the chunk name to file mappings and manually dropping main in there (has to happen after the builds are done).

## Timeline

- 2020-05-01T12:52:32Z @tobiu added the `bug` label
- 2020-05-01T12:52:32Z @tobiu added the `help wanted` label
- 2020-05-01T13:08:41Z @tobiu cross-referenced by #10630
- 2020-05-01T16:02:18Z @tobiu referenced in commit `19fb457` - "#523 in progress"
- 2020-05-01T16:05:19Z @tobiu referenced in commit `dc42ade` - "#523 adjusted the prod build"
### @tobiu - 2020-05-01T16:06:08Z

went for:
```
plugins.push(new HtmlWebpackPlugin({
    chunks  : [],
```


- 2020-05-01T16:06:21Z @tobiu assigned to @tobiu
- 2020-05-01T16:06:28Z @tobiu closed this issue

