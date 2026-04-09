---
id: 9831
title: 'fix: Explicitly import Observable mixin to prevent static evaluation crashes in MCP servers'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T18:15:18Z'
updatedAt: '2026-04-09T18:16:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9831'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T18:16:37Z'
---
# fix: Explicitly import Observable mixin to prevent static evaluation crashes in MCP servers

### The Problem
The `memory-core` and `knowledge-base` MCP daemon servers crash silently at boot time. This triggers `context deadline exceeded` connection timeouts in external clients like Gemini or Cline. The root cause is an `Error: Attempting to mixin an undefined class: Neo.core.Observable` thrown during static file evaluation.

### The Architectural Reality
In `ChromaLifecycleService.mjs` and `DatabaseLifecycleService.mjs`, the class config declares `static observable = true;`. However, neither file explicitly imports the `Neo.core.Observable` module. When `SystemLifecycleService.mjs` statically imports `ChromaLifecycleService`, it forces Node to execute `Neo.setupClass()` synchronously before `initAsync` or environment configuration (such as bypassing Chroma in favor of `aiConfig.engine = 'neo'`) can occur. 
Because module import order and timing can occasionally mask this in other files where `Observable` happens to be statically cached sooner, it results in intermittent but highly fatal swarm drop-outs depending on the engine's lazy loader.

### Avoided Traps & Gold Standards
- **Trap Avoided:** Wasting time debugging `$PATH` issues, missing `chroma` binaries, or `.venv` configurations. The crash happens during static evaluation before any `spawn('chroma')` commands can execute.
- **Trap Avoided:** Assuming the framework was ignoring the default `neo` SQLite configuration. The config *is* correct, but it acts as a runtime gate that is blocked by the static evaluation crash.
- **Solution:** We will add the explicit `Observable` imports at the top of both lifecycle services to ensure the mixin is defined reliably during `Neo.setupClass()`.

### Path Forward
Inject `import Observable from '../../../../../../src/core/Observable.mjs';` into:
1. `ai/mcp/server/memory-core/services/lifecycle/ChromaLifecycleService.mjs`
2. `ai/mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs`

## Timeline

- 2026-04-09T18:15:19Z @tobiu added the `bug` label
- 2026-04-09T18:15:20Z @tobiu added the `ai` label
- 2026-04-09T18:16:00Z @tobiu assigned to @tobiu
- 2026-04-09T18:16:20Z @tobiu referenced in commit `fd59c1e` - "fix: Explicitly import Observable mixin in MCP lifecycle services (#9831)"
### @tobiu - 2026-04-09T18:16:35Z

**Input from Antigravity (Gemini):**

> ✦ The explicit `Observable.mjs` imports have been added to both `ChromaLifecycleService.mjs` and `DatabaseLifecycleService.mjs`. 
> Tested locally using `node ai/mcp/server/memory-core/mcp-server.mjs`. The unhandled static evaluation crash is completely resolved, and the node daemon now transitions successfully to the MCP `stdio` transport handshake without triggering any `context deadline exceeded` timeouts.

- 2026-04-09T18:16:37Z @tobiu closed this issue

