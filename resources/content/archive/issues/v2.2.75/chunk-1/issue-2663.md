---
id: 2663
title: 'core.Base: parseItemConfigs()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-08-01T14:50:37Z'
updatedAt: '2021-08-01T15:00:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2663'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-08-01T15:00:34Z'
---
# core.Base: parseItemConfigs()

Move the parsing logic from `container.Base` into `core.Base` so that we can parse other entities for string based config shortcuts more easily.

One example is `form.field.Color`, which should pass the `colorField` config down to the list.

## Timeline

- 2021-08-01T14:50:37Z @tobiu added the `enhancement` label
- 2021-08-01T14:50:37Z @tobiu assigned to @tobiu
- 2021-08-01T14:53:06Z @tobiu referenced in commit `2513ef6` - "core.Base: parseItemConfigs() #2663"
- 2021-08-01T14:59:48Z @tobiu referenced in commit `dc6e230` - "#2663 component.wrapper.AmChart: chartConfig => chartConfig_, using the new parseItemConfigs() method"
- 2021-08-01T15:00:34Z @tobiu closed this issue

