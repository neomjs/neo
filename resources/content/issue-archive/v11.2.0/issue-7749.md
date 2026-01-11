---
id: 7749
title: Enhance Issue Relationship Tool to Support "Blocked By" and "Blocking"
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-12T07:58:04Z'
updatedAt: '2025-11-12T14:23:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7749'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T14:23:01Z'
---
# Enhance Issue Relationship Tool to Support "Blocked By" and "Blocking"

The `update_issue_relationship` tool successfully manages parent/child hierarchies. To provide a more complete dependency management solution, this ticket proposes extending the functionality to include "blocked by" and "blocking" relationships.

**Acceptance Criteria:**
1.  Enhance the existing `update_issue_relationship` tool or create a new one to manage "blocked by" and "blocking" relationships between issues.
2.  The tool should allow setting and unsetting these relationships via the GitHub API.
3.  The local markdown file representation should be updated to reflect these new relationship types during the `sync_all` process.

## Timeline

- 2025-11-12T07:58:05Z @tobiu added the `enhancement` label
- 2025-11-12T07:58:05Z @tobiu added the `ai` label
- 2025-11-12T08:14:45Z @tobiu cross-referenced by PR #7741
- 2025-11-12T10:21:40Z @MannXo cross-referenced by PR #7753
- 2025-11-12T14:23:01Z @tobiu closed this issue

