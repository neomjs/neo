---
id: 7652
title: 'Feat: Re-enable `npm run` scripts for MCP Servers and Validate `npx` Readiness'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T17:52:09Z'
updatedAt: '2025-10-25T17:53:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7652'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T17:53:14Z'
---
# Feat: Re-enable `npm run` scripts for MCP Servers and Validate `npx` Readiness

**Reported by:** @tobiu on 2025-10-25

This ticket documents the re-introduction of `npm run` scripts for launching the MCP servers (`neo-github-workflow`, `neo-knowledge-base`, `neo-memory-core`) and updates to `.gemini/settings.json` to utilize these scripts. This change is crucial for preparing these servers for future independent repositories and `npx`-based startup mechanisms.

**Motivation:**
Previously, direct `node` execution was used for these MCP servers in `.gemini/settings.json` (as documented in #7498) to avoid "extraneous `npm run` output" that caused compatibility issues with the Gemini CLI client. However, this approach tightly coupled the server startup to the monorepo's internal file structure.

With recent improvements, re-testing has confirmed that using `npm run` scripts no longer introduces the problematic output, and the Gemini CLI client successfully recognizes the tools.

This change is vital for:
*   **Future-Proofing:** Enabling a smoother transition when these MCP servers are moved into their own repositories and published as npm packages.
*   **`npx` Readiness:** Laying the groundwork for starting these servers via `npx <package-name>` in a consistent manner, similar to how `chrome-devtools-mcp` is launched.
*   **Consistency:** Aligning the startup mechanism of the `neo-*` MCP servers with standard npm practices.

**Changes Implemented:**

1.  **`package.json` Updates:**
    *   New `npm run` scripts have been added for each MCP server:
        *   `"ai:mcp-server-github-workflow": "node ./ai/mcp/server/github-workflow/mcp-stdio.mjs"`
        *   `"ai:mcp-server-knowledge-base": "node ./ai/mcp/server/knowledge-base/mcp-stdio.mjs"`
        *   `"ai:mcp-server-memory-core": "node ./ai/mcp/server/memory-core/mcp-stdio.mjs"`

2.  **`.gemini/settings.json` Updates:**
    *   The `command` for `neo-github-workflow`, `neo-knowledge-base`, and `neo-memory-core` has been changed from `"node"` to `"npm"`.
    *   The `args` have been updated to `["run", "ai:mcp-server-<server-name>"]` to invoke the newly defined `npm run` scripts.

**Validation:**
Re-testing in a fresh session confirmed that all MCP servers start correctly, and their tools are recognized by the Gemini CLI client, indicating that the previous compatibility issues related to `npm run` output are no longer present.

