---
id: 90
title: Enhance the create-app build to work outside the neo folder
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2019-11-24T10:54:35Z'
updatedAt: '2020-03-08T21:32:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/90'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-08T21:32:25Z'
---
# Enhance the create-app build to work outside the neo folder

following Sakis feedback:

Ideally the build script should be an npx task like

https://github.com/facebook/create-react-app

not an expert on this area, but will play with it soon. once the real world demo app is done, it has to get into a standalone repo. there i want to include neo as an npm dependency, so at this point we need build scripts working outside the repo root anyway.

## Timeline

- 2019-11-24T10:54:35Z @tobiu added the `enhancement` label
- 2019-11-24T10:54:35Z @tobiu added the `help wanted` label
### @tobiu - 2019-12-17T23:43:42Z

added a new repo for this one: https://github.com/neomjs/create-app

### @tobiu - 2020-03-08T21:32:25Z

the new build is finished => "npx neo-app", so this ticket is resolved

- 2020-03-08T21:32:25Z @tobiu closed this issue

