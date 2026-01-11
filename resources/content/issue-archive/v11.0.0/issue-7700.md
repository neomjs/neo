---
id: 7700
title: 'docs: Correct Data Layer description in CodebaseOverview.md'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T12:59:58Z'
updatedAt: '2025-11-03T13:00:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7700'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-03T13:00:53Z'
---
# docs: Correct Data Layer description in CodebaseOverview.md

The `learn/guides/fundamentals/CodebaseOverview.md` file contained an inaccurate description of the Neo.mjs data layer. The description was reminiscent of other frameworks (like ExtJS) and did not accurately portray the lightweight, on-demand nature of Neo.mjs's record management.

This change corrects the documentation to:
- Accurately describe `Neo.data.Model` and `Neo.data.Store`.
- Introduce `Neo.collection.Base` to clarify that filtering and sorting capabilities are inherited by `Neo.data.Store`.
- Emphasize the performance-oriented, lazy-instantiation of records via the `RecordFactory`.

These changes ensure that new developers and AI agents get a correct understanding of the data layer from the start.

## Timeline

- 2025-11-03T12:59:59Z @tobiu added the `documentation` label
- 2025-11-03T12:59:59Z @tobiu added the `ai` label
- 2025-11-03T13:00:22Z @tobiu assigned to @tobiu
- 2025-11-03T13:00:43Z @tobiu referenced in commit `eeb40d1` - "docs: Correct Data Layer description in CodebaseOverview.md #7700"
- 2025-11-03T13:00:53Z @tobiu closed this issue

