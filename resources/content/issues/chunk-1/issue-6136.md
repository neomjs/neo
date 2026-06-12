---
id: 6136
title: form.field.Select
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2024-12-05T19:02:44Z'
updatedAt: '2024-12-05T19:03:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6136'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# form.field.Select

A ComboBox supports typing into an input field, while a default `select` tag only supports selecting an `option`.

This topic gets interesting, since there is a stage 2 proposal => already implemented in Chrome, but hidden inside an experimental feature: https://developer.chrome.com/blog/rfc-customizable-select

We should create the base class and make it configurable & extensible for custom option renderers.

It should extend `form.field.Base` (and not `form.field.Text`). It should use a store, but also work with passing an options array (creating a default store as needed).

Scope: neo v9

## Timeline

- 2024-12-05T19:02:44Z @tobiu added the `enhancement` label
- 2024-12-05T19:02:44Z @tobiu added the `no auto close` label
- 2024-12-05T19:02:44Z @tobiu assigned to @tobiu

