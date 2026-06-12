---
id: 8766
title: 'Enhance buildScripts README with Server, AI, and Internal CLI References'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T20:07:35Z'
updatedAt: '2026-01-17T20:09:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8766'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T20:09:00Z'
---
# Enhance buildScripts README with Server, AI, and Internal CLI References

Update `buildScripts/README.md` to achieve a complete DX reference:
1.  **Add `server-start`**: Document the primary dev server command.
2.  **Add Manual AI Servers**: Document `ai:server`, `ai:server-memory`, `ai:server-neural-link`.
3.  **Add `ai:mcp-client`**: Document usage of the CLI debugging tool.
4.  **List Internal Scripts**: Add a dedicated "Internal Infrastructure" section for `ai:mcp-server-*` scripts to clarify their purpose and reduce confusion.

## Timeline

- 2026-01-17T20:07:36Z @tobiu added the `documentation` label
- 2026-01-17T20:07:37Z @tobiu added the `ai` label
- 2026-01-17T20:07:43Z @tobiu assigned to @tobiu
- 2026-01-17T20:08:34Z @tobiu referenced in commit `a9df2dd` - "docs: Enhance buildScripts README with Server and AI CLI refs (#8766)"
### @tobiu - 2026-01-17T20:08:42Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `buildScripts/README.md` to include:
> 1.  **Essential Commands**: Added `npm run server-start` as the primary development command.
> 2.  **Advanced Tools**: Documented `npm run ai:mcp-client` for CLI-based MCP testing.
> 3.  **Manual AI Servers**: Added documentation for manually starting the Knowledge Base, Memory Core, and Neural Link servers.
> 4.  **Internal Infrastructure**: Added a section listing the `ai:mcp-server-*` scripts to clarify their role as internal entry points.
> 
> The changes have been pushed to the `dev` branch.

- 2026-01-17T20:09:00Z @tobiu closed this issue

