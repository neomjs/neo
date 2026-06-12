---
id: 7653
title: 'Chore: Update MCP Server Names in `.gemini/settings.json` for Branding Consistency'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T18:19:13Z'
updatedAt: '2025-10-25T18:21:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7653'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T18:21:10Z'
---
# Chore: Update MCP Server Names in `.gemini/settings.json` for Branding Consistency

This ticket proposes updating the names of the Neo.mjs-related MCP servers within `.gemini/settings.json` to include "neo.mjs" for improved branding and clarity.

**Motivation:**
Currently, the MCP servers are named `neo-github-workflow`, `neo-knowledge-base`, and `neo-memory-core`. By prefixing them with "neo.mjs", their association with the Neo.mjs framework becomes immediately clear, enhancing branding and consistency across the ecosystem. This is a low-effort change with a positive impact on identification.

**Changes Proposed:**
Update the `mcpServers` configuration in `.gemini/settings.json` as follows:

*   `neo-github-workflow` -> `neo.mjs-github-workflow`
*   `neo-knowledge-base` -> `neo.mjs-knowledge-base`
*   `neo-memory-core` -> `neo.mjs-memory-core`

This change will be purely cosmetic at this stage, affecting only the display name within the Gemini CLI. Future steps would involve updating the internal server names and `package.json` files when these servers are externalized.


## Timeline

- 2025-10-25T18:19:15Z @tobiu added the `enhancement` label
- 2025-10-25T18:19:15Z @tobiu added the `ai` label
- 2025-10-25T18:19:34Z @tobiu assigned to @tobiu
- 2025-10-25T18:20:56Z @tobiu referenced in commit `c47432c` - "Chore: Update MCP Server Names in .gemini/settings.json for Branding Consistency #7653"
- 2025-10-25T18:21:10Z @tobiu closed this issue

