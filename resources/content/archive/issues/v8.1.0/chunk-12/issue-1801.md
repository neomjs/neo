---
id: 1801
title: 'package.json: server-start needs adjustments for v4'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-16T12:23:42Z'
updatedAt: '2021-04-16T13:59:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1801'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-16T13:59:33Z'
---
# package.json: server-start needs adjustments for v4

<i> [webpack-dev-server] Project is running at:
<i> [webpack-dev-server] Loopback: http://localhost:8080/
<i> [webpack-dev-server] On Your Network (IPv4): http://192.168.178.80:8080/
<i> [webpack-dev-server] On Your Network (IPv6): http://[fe80::1]:8080/
<i> [webpack-dev-server] Content not from webpack is served from '/Users/Shared/github/neomjs/neo/public' directory

https://github.com/webpack/webpack-cli/blob/master/SERVE-OPTIONS.md
`--content-base <value>      A directory or URL to serve HTML content from.`

this option seems to be gone inside the new version:
https://github.com/webpack/webpack-dev-server

unless i am missing something here, we need a config file just to change (remove) the not existing public directory from the path.

## Timeline

- 2021-04-16T12:23:42Z @tobiu added the `enhancement` label
- 2021-04-16T12:23:42Z @tobiu assigned to @tobiu
### @tobiu - 2021-04-16T12:29:09Z

https://github.com/webpack/webpack-dev-server/releases

breaking changes:
"the contentBase, contentBasePublicPath, serveIndex, staticOptions, watchContentBase, watchOptions were removed in favor of the static option"

will try this one

- 2021-04-16T12:38:57Z @tobiu referenced in commit `99c8871` - "package.json: server-start needs adjustments for v4 #1801"
- 2021-04-16T13:59:33Z @tobiu closed this issue

