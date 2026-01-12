---
id: 7545
title: Convert summaryService to SummaryService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T13:44:02Z'
updatedAt: '2025-10-18T13:50:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7545'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-18T13:50:10Z'
---
# Convert summaryService to SummaryService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/memory-core/services/summaryService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `SummaryService.mjs` to follow a more consistent naming convention. This service handles deleting, listing, and querying session summaries.

## Acceptance Criteria

1.  A new file `ai/mcp/server/memory-core/services/SummaryService.mjs` is created with the refactored `SummaryService` class content.
2.  The `SummaryService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`deleteAllSummaries`, `listSummaries`, `querySummaries`) are converted into class methods.
4.  The old file `ai/mcp/server/memory-core/services/summaryService.mjs` is deleted.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `SummaryService` singleton and map its methods.
6.  Any other services that depend on `summaryService` are updated to use the new `SummaryService` singleton instance.
7.  All related tools (e.g., `delete_all_summaries`, `get_all_summaries`, `query_summaries`) continue to function correctly after the refactoring.

## Timeline

- 2025-10-18T13:44:02Z @tobiu assigned to @tobiu
- 2025-10-18T13:44:03Z @tobiu added parent issue #7536
- 2025-10-18T13:44:04Z @tobiu added the `enhancement` label
- 2025-10-18T13:44:04Z @tobiu added the `ai` label
- 2025-10-18T13:45:09Z @tobiu referenced in commit `92e7e94` - "#7545 renamed the service first"
- 2025-10-18T13:50:03Z @tobiu referenced in commit `1ac045c` - "Convert summaryService to SummaryService Neo.mjs Class #7545"
- 2025-10-18T13:50:10Z @tobiu closed this issue

