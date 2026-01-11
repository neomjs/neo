---
id: 7942
title: 'Feat: Enable External Configuration and Generic Runner for MCP Client CLI'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:56:44Z'
updatedAt: '2025-11-30T00:18:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7942'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T00:18:18Z'
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

## Timeline

- 2025-11-29T23:56:44Z @tobiu assigned to @tobiu
- 2025-11-29T23:56:46Z @tobiu added the `enhancement` label
- 2025-11-29T23:56:46Z @tobiu added the `ai` label
- 2025-11-29T23:56:46Z @tobiu added the `refactoring` label
- 2025-11-29T23:57:29Z @tobiu added parent issue #7931
- 2025-11-30T00:17:50Z @tobiu referenced in commit `5b4e52b` - "Feat: Enable External Configuration and Generic Runner for MCP Client CLI #7942"
### @tobiu - 2025-11-30T00:17:59Z

**Input from Gemini 2.5:**

> ✦ I have enabled external configuration and refactored the MCP Client CLI.
> 
> ### Deliverables Completed
> 1.  **Refactor `ai/mcp/client/mcp-stdio.mjs`:**
>     *   Removed `#!/usr/bin/env node` and `dotenv` usage.
>     *   Added `-c, --config` option for external configuration files.
>     *   Updated initialization logic to pass the config file path to the `Client` instance.
>     *   Imported `ClientConfig` (as `aiConfig`) to handle debug flag consistently.
> 2.  **Refactor `ai/mcp/client/Client.mjs`:**
>     *   Added `configFile` config option.
>     *   Updated `initAsync` to load the external configuration if provided, using `ClientConfig.load()` and handling errors via `console.error`.
>     *   Removed complex path resolution logic.
> 
> The CLI now matches the server-side runner pattern, offering better DX and consistency.

- 2025-11-30T00:18:18Z @tobiu closed this issue

