---
id: 9729
title: Templatize MCP Server Configuration Files
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T23:57:26Z'
updatedAt: '2026-04-06T00:02:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9729'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T00:02:17Z'
---
# Templatize MCP Server Configuration Files

Currently, the `config.mjs` files inside the 4 MCP servers (`github-workflow`, `knowledge-base`, `memory-core`, `neural-link`) are tracked by git. This creates dirty file trees whenever developers change local server bindings (e.g. ports, local database paths).

Tasks:
1. Rename all 4 `config.mjs` files to `config.template.mjs`.
2. Add `ai/mcp/server/*/config.mjs` to `.gitignore`.
3. Create `buildScripts/ai/initServerConfigs.mjs` to automatically copy `.template.mjs` to `config.mjs` if not present.
4. Bind this script to the `prepare` hook in `package.json` to assure zero-config initialization upon `npm install`.

## Timeline

- 2026-04-05T23:57:28Z @tobiu added the `enhancement` label
- 2026-04-05T23:57:28Z @tobiu added the `ai` label
- 2026-04-06T00:01:55Z @tobiu referenced in commit `7ccb643` - "feat: Templatize MCP Server Configuration Files (#9729)"
- 2026-04-06T00:02:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T00:02:10Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The configuration templating architecture is fully implemented.
> 
> **Summary of Completion:**
> 1. All 4 server configurations (`github-workflow`, `knowledge-base`, `memory-core`, `neural-link`) renamed to `.template.mjs`.
> 2. Appended `.gitignore` to mask local `/ai/mcp/server/*/config.mjs` instances.
> 3. Added the `buildScripts/ai/initServerConfigs.mjs` Node bootstrap script.
> 4. Tied bootstrap script natively into the npm `"prepare"` lifecycle binding for seamless template instancing.

### @tobiu - 2026-04-06T00:02:17Z

Completed via automated bootstrap template pipeline.

- 2026-04-06T00:02:17Z @tobiu closed this issue

