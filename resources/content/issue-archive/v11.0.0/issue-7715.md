---
id: 7715
title: Create .npmignore file to exclude tickets and release notes from npm package
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-07T08:57:24Z'
updatedAt: '2025-11-07T09:03:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7715'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-07T09:03:07Z'
---
# Create .npmignore file to exclude tickets and release notes from npm package

The npm package size is getting unnecessarily bloated by including local copies of GitHub issues and release notes, which are managed by the new github-workflow MCP server. An `.npmignore` file should be created to prevent these and other development-specific files from being included in the published package. The file should inherit all rules from `.gitignore` and add exclusions for `.github/ISSUE` and `.github/RELEASE_NOTES`.

## Timeline

- 2025-11-07T08:57:25Z @tobiu added the `enhancement` label
- 2025-11-07T08:57:25Z @tobiu added the `ai` label
- 2025-11-07T08:59:24Z @tobiu assigned to @tobiu
- 2025-11-07T09:02:54Z @tobiu referenced in commit `9e8b43e` - "Create .npmignore file to exclude tickets and release notes from npm package #7715"
- 2025-11-07T09:03:07Z @tobiu closed this issue

