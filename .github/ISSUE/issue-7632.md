---
id: 7632
title: 'feat(mcp): Add tool to manage GitHub issue relationships'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - MannXo
createdAt: '2025-10-24T10:15:43Z'
updatedAt: '2025-11-11T09:28:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7632'
author: tobiu
commentsCount: 2
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

## Comments

### @MannXo - 2025-11-11 09:13

@tobiu I can take on this one if it's alright.

### @tobiu - 2025-11-11 09:28

@MannXo this ticket is definitely a fascinating one. I have not looked into the API yet. Assuming that relationships do not contain comments, i would add this info at the bottom of each ticket (below comments). E.g. `## History` or `## Relationships`.

To get the idea: https://raw.githubusercontent.com/neomjs/neo/refs/heads/dev/.github/ISSUE/issue-7733.md

