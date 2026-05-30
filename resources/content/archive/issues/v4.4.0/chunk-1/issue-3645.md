---
id: 3645
title: Enable view model bindings into layouts
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-12-20T09:18:17Z'
updatedAt: '2022-12-20T09:28:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3645'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-20T09:28:18Z'
---
# Enable view model bindings into layouts

Right now, view models (model.Component) are limited to components, which also includes bindings (bind config).

It would be very useful to allow bindings inside layouts as well.

Example: `{ntype: 'card', bind: {activeIndex: data => data.activeIndex}}`

We could automatically switch the card layout index of a container in case a vm data prop changes.

I am not sure if there are other good use cases, but to keep it generic, I will add the required logic into `layout.Base`. 

## Timeline

- 2022-12-20T09:18:17Z @tobiu added the `enhancement` label
- 2022-12-20T09:18:17Z @tobiu assigned to @tobiu
- 2022-12-20T09:28:14Z @tobiu referenced in commit `d5b4a78` - "Enable view model bindings into layouts #3645"
- 2022-12-20T09:28:18Z @tobiu closed this issue

