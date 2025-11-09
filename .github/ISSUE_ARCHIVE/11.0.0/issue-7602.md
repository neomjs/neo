---
id: 7602
title: 'MCP Tool Handlers Lose `this` Context, Causing Private Field Errors'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T10:17:19Z'
updatedAt: '2025-10-22T10:18:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7602'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-22T10:18:05Z'
---
# MCP Tool Handlers Lose `this` Context, Causing Private Field Errors

**Reported by:** @tobiu on 2025-10-22

A critical bug was discovered in the MCP server's `toolService`. When a tool method was called (e.g., `healthcheck`), it failed with the error: `Cannot read private member #... from an object whose class did not declare it`.

### Root Cause

The issue originated in the `serviceMapping` objects within each server's `toolService.mjs` file (e.g., `ai/mcp/server/github-workflow/services/toolService.mjs`). When methods were assigned to the mapping, only a reference to the function was stored, without its `this` context.

```javascript
// Example of the problematic code
const serviceMapping = {
    healthcheck: HealthService.healthcheck, // Loses the context of the HealthService instance
    // ... other methods
};
```

When the generic `toolService` later invoked this handler, it was called as a standalone function, causing `this` to be `undefined` and making it impossible to access any private class fields (like `#cachedHealth` in `HealthService`).

## Resolution

The fix was to explicitly bind each method to its singleton service instance at the point of creating the `serviceMapping`. This ensures that the method always executes with its correct `this` context.

```javascript
// Example of the fix
const serviceMapping = {
    healthcheck: HealthService.healthcheck.bind(HealthService),
    // ... other methods bound similarly
};
```

This change was applied to the `toolService.mjs` file in all three MCP servers:
- `github-workflow`
- `knowledge-base`
- `memory-core`

This resolves the bug and makes the tool handling mechanism more robust and reliable.

