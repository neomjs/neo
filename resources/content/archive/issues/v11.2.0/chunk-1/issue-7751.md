---
id: 7751
title: Refactor IssueSyncer to Remove Redundant Body Content
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-12T08:12:03Z'
updatedAt: '2025-11-13T10:12:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7751'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T10:12:48Z'
---
# Refactor IssueSyncer to Remove Redundant Body Content

Currently, the `IssueSyncer` generates markdown files where metadata (like the author and sub-issue lists) is duplicated in both the YAML frontmatter and the visible markdown body. This creates bloated files and requires complex logic to strip this redundant information before pushing updates back to GitHub.

This ticket proposes refactoring the `IssueSyncer` to treat the frontmatter as the single source of truth for all metadata, with the exception of a human-readable progress summary.

**Acceptance Criteria:**
1.  Modify `#formatIssueMarkdown` in `IssueSyncer.mjs` to stop generating the `Reported by:` and `Sub-Issues:` sections in the markdown body.
2.  The `**Progress:** ...` line should be retained in the body for at-a-glance readability.
3.  Simplify the body-cleaning logic in `pushToGitHub` to reflect that only the `Reported by:` line and title need to be stripped before pushing.
4.  The resulting local markdown files will be cleaner, containing only the issue title, the progress summary (if applicable), and the core body content.

## Timeline

- 2025-11-12T08:12:04Z @tobiu added the `enhancement` label
- 2025-11-12T08:12:04Z @tobiu added the `ai` label
- 2025-11-12T08:12:05Z @tobiu added the `refactoring` label
- 2025-11-12T08:14:45Z @tobiu cross-referenced by PR #7741
- 2025-11-13T06:11:14Z @MannXo cross-referenced by PR #7762
- 2025-11-13T10:12:48Z @tobiu closed this issue

