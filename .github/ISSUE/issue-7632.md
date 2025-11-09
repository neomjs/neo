---
id: 7632
title: 'feat(mcp): Add tool to manage GitHub issue relationships'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-10-24T10:15:43Z'
updatedAt: '2025-10-24T10:15:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7632'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# feat(mcp): Add tool to manage GitHub issue relationships

**Reported by:** @tobiu on 2025-10-24

This ticket is for creating a new tool within the GitHub Workflow MCP server to manage relationships between issues. Currently, parent/sub-issue relationships are managed manually by editing the markdown files. A dedicated tool would streamline this process.

**Acceptance Criteria:**
1. A new tool (e.g., `update_issue_relationship`) is added to the GitHub Workflow MCP server.
2. The tool should allow setting or unsetting the `parentIssue` field for a given issue.
3. The tool should automatically update the `subIssues` array on the parent issue when a child is added or removed.
4. The changes should be synced back to the local markdown files via the existing `sync_all` mechanism or a more direct update.

