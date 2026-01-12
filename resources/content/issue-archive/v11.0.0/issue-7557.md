---
id: 7557
title: Convert issueService to IssueService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T22:35:58Z'
updatedAt: '2025-10-19T22:41:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7557'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T22:41:45Z'
---
# Convert issueService to IssueService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/github-workflow/services/issueService.mjs` into a singleton `IssueService` class that extends `Neo.core.Base`. This service will handle interactions with GitHub issues, such as adding and removing labels.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/issueService.mjs` is renamed to `IssueService.mjs`.
2.  The content is replaced with an `IssueService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing functions (`addLabels`, `removeLabels`) are converted into class methods.
4.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `IssueService` class.
5.  The `add_labels` and `remove_labels` tools continue to function correctly after the refactoring.

## Timeline

- 2025-10-19T22:35:58Z @tobiu assigned to @tobiu
- 2025-10-19T22:35:59Z @tobiu added the `enhancement` label
- 2025-10-19T22:35:59Z @tobiu added the `ai` label
- 2025-10-19T22:35:59Z @tobiu added parent issue #7536
- 2025-10-19T22:38:31Z @tobiu referenced in commit `417c7b5` - "Convert issueService to IssueService Neo.mjs Class #7557"
- 2025-10-19T22:41:26Z @tobiu referenced in commit `aede4ce` - "#7557 returning error objects instead of throw"
- 2025-10-19T22:41:46Z @tobiu closed this issue

