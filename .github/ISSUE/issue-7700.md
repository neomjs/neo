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
closedAt: '2025-11-03T13:00:53Z'
---
# docs: Correct Data Layer description in CodebaseOverview.md

**Reported by:** @tobiu on 2025-11-03

The `learn/guides/fundamentals/CodebaseOverview.md` file contained an inaccurate description of the Neo.mjs data layer. The description was reminiscent of other frameworks (like ExtJS) and did not accurately portray the lightweight, on-demand nature of Neo.mjs's record management.

This change corrects the documentation to:
- Accurately describe `Neo.data.Model` and `Neo.data.Store`.
- Introduce `Neo.collection.Base` to clarify that filtering and sorting capabilities are inherited by `Neo.data.Store`.
- Emphasize the performance-oriented, lazy-instantiation of records via the `RecordFactory`.

These changes ensure that new developers and AI agents get a correct understanding of the data layer from the start.

