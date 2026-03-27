---
id: 9567
title: Update AI_QUICK_START.md to include Antigravity configuration
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T09:52:26Z'
updatedAt: '2026-03-27T09:58:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9567'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T09:58:33Z'
---
# Update AI_QUICK_START.md to include Antigravity configuration

The `AI_QUICK_START.md` currently only provides instructions for using the Gemini CLI. We need to split the configuration section to support both Gemini CLI and Antigravity environments.

Specifically:
- Outline the repository-level `.gemini/settings.json` for the CLI.
- Explain the user-level `~/.gemini/antigravity/mcp_config.json` needed for Antigravity.
- Include a generalized `mcp_config.json` JSON block as a reference while omitting real API keys.

## Timeline

- 2026-03-27T09:52:27Z @tobiu added the `documentation` label
- 2026-03-27T09:52:27Z @tobiu added the `enhancement` label
- 2026-03-27T09:52:28Z @tobiu added the `ai` label
- 2026-03-27T09:58:30Z @tobiu referenced in commit `6dba635` - "docs: Update AI_QUICK_START.md to include Antigravity configuration (#9567)"
- 2026-03-27T09:58:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T09:58:33Z

**Input from Gemini Pro (Antigravity):**

> ✦ The Quick Start document has been successfully updated to include instructions for both Gemini CLI and Antigravity environments. The respective configuration locations, placeholder structures, and macOS specific examples for `<DEFAULT_PATH>` and `<YOUR_NODE_PATH>` have been documented as requested.

- 2026-03-27T09:58:33Z @tobiu closed this issue

