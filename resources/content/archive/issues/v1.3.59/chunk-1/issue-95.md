---
id: 95
title: 'server-start: throws 2 errors'
state: CLOSED
labels:
  - bug
  - help wanted
assignees: []
createdAt: '2019-11-25T12:21:42Z'
updatedAt: '2020-08-31T14:24:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/95'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-31T14:24:44Z'
---
# server-start: throws 2 errors

Starting the webserver does open a new Chrome tab and launches as intended, however it does throw 2 bugs which might be confusing for new users.

The bugs are kind of intentional:

The webserver is supposed to serve the files inside the src folder, but should not do any webpack related builds.

We could replace the webserver with a different one in case this makes more sense.

## Timeline

- 2019-11-25T12:21:42Z @tobiu added the `bug` label
- 2019-11-25T12:21:42Z @tobiu added the `help wanted` label
### @tobiu - 2019-11-25T12:24:31Z

related to #95

- 2019-11-25T12:24:52Z @tobiu cross-referenced by #96
- 2019-12-02T10:46:01Z @tobiu changed title from **webpack-dev-server => open: throws 2 errors** to **server-start: throws 2 errors**
- 2020-03-23T15:37:09Z @tobiu cross-referenced by #1
### @tobiu - 2020-08-31T14:24:43Z

#1152 fixed them.

- 2020-08-31T14:24:44Z @tobiu closed this issue

