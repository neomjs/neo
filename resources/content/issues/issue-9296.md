---
id: 9296
title: Create Docker Sandbox for Autonomous Agents
state: OPEN
labels:
  - enhancement
  - ai
  - build
assignees: []
createdAt: '2026-02-24T19:32:10Z'
updatedAt: '2026-02-25T15:22:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9296'
author: tobiu
commentsCount: 1
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Docker Sandbox for Autonomous Agents

### Problem
Autonomous, looping agents need an isolated environment where they can execute downloaded code, crash browsers, or make mistakes without affecting the host developer machine.

### Solution
Create a `Dockerfile.agent` (likely within `ai/demo-agents/`) that bundles Node.js, Chromium, and the Neo MCP servers. This provides a safe, reproducible Linux sandbox for the Neo Orchestrator to run headless browser sessions via the `chrome-devtools` MCP server.

## Timeline

- 2026-02-24T19:32:11Z @tobiu added the `enhancement` label
- 2026-02-24T19:32:11Z @tobiu added the `ai` label
- 2026-02-24T19:32:11Z @tobiu added the `build` label
- 2026-02-24T19:32:21Z @tobiu added parent issue #9295
### @mavdol - 2026-02-25T15:22:07Z

Hi, just saw this issue about sandboxing for autonomous agents. I wonder if it could work in more of a per-action way.

I've been working on a lightweight runtime that runs untrusted code in WebAssembly sandboxes. Might be a good fit here.

For example, in your agent workflow:

```typescript
import { run } from '@capsule-run/sdk/runner';

const result = await run({
    file: './sandbox.ts',
    args: [downloadedCode]
});
```
And in `sandbox.ts`:
```typescript
import { task } from "@capsule-run/sdk";

export const executeCode = task({
  name: "execute_code",
  compute: "MEDIUM",
  timeout: "30s"
}, (code: string) => {
  // Your code runs safely in a Wasm sandbox
  return eval(code);
});

export const main = task({
  name: "main", 
  compute: "HIGH"
}, async (code: string) => {
  return executeCode(code);
});
```

Each task runs in its own Wasm sandbox with configurable CPU and memory limits, timeouts, and filesystem access only if explicitly granted.

I think it could help for the parts where agents execute downloaded code, as a complementary approach to Docker maybe.

There's more info in the repo if you're curious: https://github.com/mavdol/capsule

Would love to hear your thoughts on whether this fits Neo's architecture!


