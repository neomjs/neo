---
id: 9578
title: 'Portal: Add TreeGrid Big Data Example'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T12:55:43Z'
updatedAt: '2026-03-27T13:01:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9578'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T13:01:02Z'
---
# Portal: Add TreeGrid Big Data Example

The newly created `TreeGrid Big Data` example needs to be integrated into the Portal's application launcher.

**Tasks:**
1. Enable `showHelperLines_` by default inside `Neo.grid.column.Tree` to visualize hierarchy depth.
2. Enable the "Helper Lines" checkbox natively within the `ControlsContainer` of the newly created example.
3. Add the `TreeGrid - Big Data` entry (id mapping and URL routing) to all environment configurations:
   - `examples_devmode.json`
   - `examples_dist_dev.json`
   - `examples_dist_esm.json`
   - `examples_dist_prod.json`

## Timeline

- 2026-03-27T12:55:43Z @tobiu added the `documentation` label
- 2026-03-27T12:55:44Z @tobiu added the `enhancement` label
- 2026-03-27T12:55:44Z @tobiu added the `ai` label
- 2026-03-27T12:57:56Z @tobiu referenced in commit `ce33ca3` - "feat: Portal: Add TreeGrid Big Data Example (#9578)"
- 2026-03-27T13:00:40Z @tobiu assigned to @tobiu
- 2026-03-27T13:01:02Z @tobiu closed this issue

