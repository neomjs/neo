---
id: 32
title: Document .env requirements for AI tooling in README
state: CLOSED
labels:
  - documentation
assignees:
  - tobiu
createdAt: '2025-12-02T14:09:37Z'
updatedAt: '2025-12-02T14:13:30Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/32'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T14:13:30Z'
---
# Document .env requirements for AI tooling in README

Update `README.md` to explicitly mention the need for a `.env` file in the workspace root to enable AI tooling.

**Requirements:**
- The `.env` file must contain:
  - `GEMINI_API_KEY`: For the generative AI features.
  - `GH_TOKEN`: For the GitHub workflow MCP server.
- Mention that this file is already `.gitignore`d by default for security.

## Activity Log

- 2025-12-02 @tobiu added the `documentation` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `b6fdc02` - "Document .env requirements for AI tooling in README #32"
- 2025-12-02 @tobiu closed this issue

