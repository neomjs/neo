---
id: 8223
title: Investigate and Fix get_component_tree Timeout
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2025-12-30T18:48:56Z'
updatedAt: '2025-12-30T23:47:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8223'
author: tobiu
commentsCount: 2
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T23:47:56Z'
---
# Investigate and Fix get_component_tree Timeout

During testing of the Neural Link capabilities, the `get_component_tree` tool consistently timed out (30s limit) when querying an active App Worker session (`2aad7032-5222-4817-90d5-8e7fa7539eca`).

**Tasks:**
1.  Investigate why the request is timing out.
    *   Is the message reaching the App Worker?
    *   Is the App Worker failing to serialize the tree?
    *   Is the response getting lost in the bridge?
2.  Optimize the serialization performance if necessary.
3.  Consider implementing pagination or partial tree retrieval if the full tree is too large.
4.  Verify the fix by successfully retrieving a component tree from a live session.

## Timeline

- 2025-12-30T18:48:57Z @tobiu added the `bug` label
- 2025-12-30T18:48:57Z @tobiu added the `ai` label
- 2025-12-30T18:48:57Z @tobiu added the `performance` label
- 2025-12-30T18:49:06Z @tobiu assigned to @tobiu
- 2025-12-30T18:49:17Z @tobiu added parent issue #8169
- 2025-12-30T19:04:36Z @tobiu referenced in commit `ba3f952` - "#8223 ConnectionService.mjs logging"
### @tobiu - 2025-12-30T19:04:42Z

**Input from Gemini 3:**

> ✦ I have instrumented `ai/mcp/server/neural-link/services/ConnectionService.mjs` with detailed logging to diagnose the timeout issue.
> 
> **Changes:**
> 1.  Redirected `spawnBridge` stdout/stderr to a local `./bridge.log` file.
> 2.  Added `logger.info` to `call` to track outgoing requests.
> 3.  Added `logger.info` to `handleAppMessage` to track incoming responses from the App Worker.
> 
> **Next Steps:**
> Restart the MCP server (and Gemini CLI) to load the instrumented code, then reproduce the timeout and analyze `./bridge.log`.

- 2025-12-30T23:45:56Z @tobiu referenced in commit `54bacae` - "Investigate and Fix get_component_tree Timeout #8223"
### @tobiu - 2025-12-30T23:47:13Z

**Input from Antigravity:**

> ◆ **Resolution Report**
> 
> We have successfully diagnosed and resolved the `get_component_tree` timeout and correctness issues.
> 
> ### 1. Root Cause Analysis
> - **Timeout (30s):** The timeout was not caused by slow component serialization, but by an unhandled edge case in `Bridge.mjs`. When an App Worker reloaded and obtained a new session ID, the Agent continued sending requests to the old (stale) ID. The Bridge dropped these messages silently, causing the Agent to hang until the 30s timeout.
> - **Incorrect Tree Data:** The original implementation used `Neo.manager.Component.getChildren()`, which relied on `VNodeUtil.getChildIds()`. This method stops at component boundaries, failing to return the deep component tree.
> 
> ### 2. Fixes Implemented
> 
> #### A. Logic & Correctness (ComponentService.mjs)
> We replaced the retrieval method with `getChildComponents`, which correctly traverses the full hierarchy.
> ```javascript
> // src/ai/client/ComponentService.mjs
> - const children = Neo.manager.Component.getChildren(component);
> + const children = Neo.manager.Component.getChildComponents(component);
> ```
> *Status: Verified 1-line change cleanliness.*
> 
> #### B. Transport Reliability (Bridge.mjs)
> Updated `handleAgentMessage` to send an immediate JSON-RPC error response if the target App ID is not found.
> ```javascript
> // ai/mcp/server/neural-link/Bridge.mjs
> if (agentWs && payload.message && payload.message.id) {
>     agentWs.send(JSON.stringify({
>         type: 'app_message',
>         appWorkerId: payload.target,
>         message: {
>             id: payload.message.id,
>             error: { code: -32000, message: `Target App [${payload.target}] not found` }
>         }
>     }));
> }
> ```
> *Status: Verified. Eliminates the 30s hang, failing fast instead.*
> 
> ### 3. Process Improvements
> - Established **Anti-Reformatting Protocol** in `.agent/ANTIGRAVITY_RULES.md` and linked it to the agent context.
> - Enforced `sed` usage for surgical edits to prevent "formatting noise" in diffs.
> 
> The issue is resolved and the codebase is clean.

- 2025-12-30T23:47:57Z @tobiu closed this issue

