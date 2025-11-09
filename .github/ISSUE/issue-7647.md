---
id: 7647
title: 'Fix: MCP Server Misinterprets Tool Error Responses'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T14:19:33Z'
updatedAt: '2025-10-25T14:20:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7647'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T14:20:34Z'
---
# Fix: MCP Server Misinterprets Tool Error Responses

**Reported by:** @tobiu on 2025-10-25

This ticket reports and resolves a bug in the MCP server's tool handling logic that caused it to misinterpret structured error responses from underlying services as schema validation failures.

**Problem:**
When a tool's underlying service (e.g., `IssueService.createIssue`) returned a structured error object (e.g., `{"error": "...", "message": "...", "code": "..."}`), the MCP server's `CallToolRequestSchema` handler incorrectly set the `isError` flag to `false` in its response. This led the client (e.g., the Python SDK) to attempt to validate the error object against the tool's *success output schema*, resulting in a misleading "Structured content does not match the tool's output schema: data should NOT have additional properties" error.

**Root Cause:**
The `mcp-stdio.mjs` file's `CallToolRequestSchema` handler unconditionally set `isError: false` when processing the `result` from `callTool`, even if `result` itself was a structured error object.

**Solution:**
The `CallToolRequestSchema` handler in `mcp-stdio.mjs` has been adjusted to correctly identify if the `result` from `callTool` is an error object (by checking for the presence of an `error` property). The `isError` flag in the MCP server's response is now conditionally set to `true` if the tool's result is an error, ensuring proper error propagation to the client.

**Changes Implemented:**
The `CallToolRequestSchema` handler in `mcp-stdio.mjs` was modified as follows:
```javascript
        let contentBlock;
        let isServiceError    = false;
        let structuredContent = null;

        if (typeof result === 'object' && result !== null) {
            isServiceError = 'error' in result; // Check for 'error' property to identify service errors

            contentBlock = {
                type: 'text',
                text: JSON.stringify(result, null, 2)
            };
            structuredContent = result;
        } else {
            contentBlock = {
                type: 'text',
                text: String(result)
            };
        }

        const response = {
            content: [contentBlock],
            isError: isServiceError // Set isError based on whether the service result was an error
        };
```
This ensures that error responses from tools are correctly identified and propagated.

