---
id: 8323
title: Fix Neural Link Tool Mappings
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T19:09:11Z'
updatedAt: '2026-01-04T19:13:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8323'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T19:12:46Z'
---
# Fix Neural Link Tool Mappings

Missing tool mappings were identified during manual testing of the Neural Link.

**Server-Side (`toolService.mjs`):**
Missing mappings for:
- `highlight_component`
- `simulate_event`
- `get_dom_event_listeners`
- `get_dom_event_summary`
- `get_method_source`
- `patch_code`

**Client-Side (`Client.mjs`):**
Missing mappings for:
- `get_computed_styles`
- `inspect_class`

This causes these tools to fail with either "Tool not found" (server-side missing) or "Unknown method" (client-side missing).

## Timeline

- 2026-01-04T19:09:12Z @tobiu added the `bug` label
- 2026-01-04T19:09:12Z @tobiu added the `ai` label
- 2026-01-04T19:11:36Z @tobiu referenced in commit `b6833f6` - "Fix Neural Link Tool Mappings (#8323)"
- 2026-01-04T19:12:04Z @tobiu assigned to @tobiu
- 2026-01-04T19:12:46Z @tobiu closed this issue
### @tobiu - 2026-01-04T19:13:26Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fixes for the missing tool mappings in commit `b6833f62a`.
> 
> **Fixes Applied:**
> - Updated `ai/mcp/server/neural-link/services/toolService.mjs` to include the missing service mappings.
> - Updated `src/ai/Client.mjs` to include the missing client-side service mappings.
> 
> **Note:** These changes require a restart of the Neural Link MCP server to take effect. In the meantime, I am continuing to explore the other available tools in the current session.

- 2026-01-04T19:17:12Z @tobiu added parent issue #8169

