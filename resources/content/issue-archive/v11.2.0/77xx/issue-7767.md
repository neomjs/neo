---
id: 7767
title: 'Refactor: Remove Relationship Section from Issue Body'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-13T10:41:01Z'
updatedAt: '2025-11-13T10:51:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7767'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T10:51:52Z'
---
# Refactor: Remove Relationship Section from Issue Body

The `IssueSyncer` currently generates a `## Relationships` section in the markdown body of local issue files. Since all relationship data (parent, sub-issues, blocking, etc.) is now stored in the YAML frontmatter, this section is redundant.

This ticket is to remove the logic that generates this section from the `formatIssueMarkdown` method, making the frontmatter the single source of truth for relationship metadata and simplifying the markdown content.

## Timeline

- 2025-11-13T10:41:02Z @tobiu added the `ai` label
- 2025-11-13T10:41:02Z @tobiu added the `refactoring` label
- 2025-11-13T10:41:51Z @tobiu assigned to @tobiu
- 2025-11-13T10:51:45Z @tobiu referenced in commit `46a15f4` - "Refactor: Remove Relationship Section from Issue Body #7767"
- 2025-11-13T10:51:52Z @tobiu closed this issue

