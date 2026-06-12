---
id: 7607
title: Add Release Name as H1 Header in Synced Release Note Files
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T12:20:25Z'
updatedAt: '2025-10-22T12:21:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7607'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T12:20:57Z'
---
# Add Release Name as H1 Header in Synced Release Note Files

There is an inconsistency between how synced issue files and synced release note files are generated. For issues, the issue `title` is included as an H1 markdown header in the body of the file. For release notes, the release `name` (the title) was only stored in the YAML frontmatter, not in the body.

This change implements the same pattern for release notes, improving the readability and consistency of the generated markdown files.

## Resolution

The `#syncReleaseNotes` method in `ai/mcp/server/github-workflow/services/SyncService.mjs` was updated. It now constructs the body of the markdown file by prepending the `release.name` as an H1 header (`# ${release.name}`) to the `release.description`.

This ensures that the title of the release is immediately visible in the content of the file, just as it is for issues.

## Timeline

- 2025-10-22T12:20:26Z @tobiu assigned to @tobiu
- 2025-10-22T12:20:27Z @tobiu added the `enhancement` label
- 2025-10-22T12:20:49Z @tobiu referenced in commit `6210585` - "Add Release Name as H1 Header in Synced Release Note Files #7607"
- 2025-10-22T12:20:57Z @tobiu closed this issue
- 2025-10-22T12:21:19Z @tobiu added the `ai` label

