---
id: 7942
title: 'Feat: Enable External Configuration and Generic Runner for MCP Client CLI'
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:56:44Z'
updatedAt: '2025-11-29T23:56:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7942'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Enable External Configuration and Generic Runner for MCP Client CLI

To align the MCP Client CLI with the server-side runner architecture, this task will enhance `ai/mcp/client/mcp-stdio.mjs` to support loading external configuration files via a `-c` option and remove unnecessary environment setup specific to direct Node.js execution.

### Deliverables
1.  **Refactor `ai/mcp/client/mcp-stdio.mjs`:**
    *   Remove `#!/usr/bin/env node` shebang.
    *   Remove `dotenv` import and usage.
    *   Add a Commander option `-c, --config <path>` for specifying an external client configuration file.
    *   Integrate `ClientConfig.load(options.config)` to load and merge external configurations.
    *   Make `--server <name>` option optional (default action TBD, perhaps list available servers or require it for specific commands).
2.  **Update Documentation:** Ensure JSDoc and comments reflect the new usage.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added the `refactoring` label

