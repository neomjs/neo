---
id: 1194
title: layout.CssGrid
state: CLOSED
labels:
  - enhancement
  - discussion
assignees: []
createdAt: '2020-09-15T11:56:07Z'
updatedAt: '2022-12-16T13:01:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1194'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-12-16T13:01:26Z'
---
# layout.CssGrid

I am not 100% sure if we need this one, but it could make sense, since neo has a flexbox-wrapper layout class in place.

We could do the same for display: grid

https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout

https://webkit.org/demos/css-grid/

Using display: grid can obviously make sense. I am not sure about the wrapper though: many attributes are custom, like defining area names. we could map those to child item configs, but it will get mapped into inline styles for most of them.

Thoughts?

## Timeline

- 2020-09-15T11:56:07Z @tobiu added the `enhancement` label
- 2020-09-15T11:56:07Z @tobiu added the `discussion` label
### @tobiu - 2022-06-12T17:12:56Z

quick update: we will need this one soon-ish for a client project.

- 2022-12-16T12:59:16Z @tobiu referenced in commit `0bf34d2` - "layout.CssGrid #1194"
- 2022-12-16T13:00:48Z @tobiu referenced in commit `3ab6f95` - "layout.CssGrid #1194 added into container.Base"
### @tobiu - 2022-12-16T13:01:26Z

added a super simplistic version. we should create new tickets for feature requests

- 2022-12-16T13:01:27Z @tobiu closed this issue

