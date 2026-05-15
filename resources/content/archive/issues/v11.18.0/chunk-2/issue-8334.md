---
id: 8334
title: Fix query_component missing returnProperties argument
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T12:46:40Z'
updatedAt: '2026-01-05T12:48:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8334'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T12:48:10Z'
---
# Fix query_component missing returnProperties argument

The `query_component` tool in the Neural Link MCP server fails to pass the `returnProperties` argument from the API request to the client-side service.

**Root Cause:**
In `ai/mcp/server/neural-link/services/ComponentService.mjs`, the `queryComponent` method destructs its arguments but omits `returnProperties`:
```javascript
async queryComponent({selector, rootId, sessionId}) {
    return await ConnectionService.call(sessionId, 'query_component', {selector, rootId});
}
```

**Impact:**
The `returnProperties` feature (returning a lean response) is silently ignored, causing the tool to always return the full component serialization.

**Fix:**
Update the method signature and the `ConnectionService.call` arguments to include `returnProperties`.

## Timeline

- 2026-01-05T12:46:41Z @tobiu added the `bug` label
- 2026-01-05T12:46:41Z @tobiu added the `ai` label
- 2026-01-05T12:47:06Z @tobiu assigned to @tobiu
- 2026-01-05T12:47:14Z @tobiu added parent issue #8169
- 2026-01-05T12:48:04Z @tobiu referenced in commit `d936b6c` - "Fix query_component missing returnProperties argument #8334"
- 2026-01-05T12:48:10Z @tobiu closed this issue

