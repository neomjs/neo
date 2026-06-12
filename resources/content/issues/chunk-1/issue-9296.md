---
id: 9296
title: '[Blocked] Autonomous agent action sandbox after cloud and Moltbook shape'
state: OPEN
labels:
  - enhancement
  - ai
  - build
assignees: []
createdAt: '2026-02-24T19:32:10Z'
updatedAt: '2026-06-03T08:05:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9296'
author: tobiu
commentsCount: 2
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9297 External-agent identity/auth boundary after Moltbook API decision'
  - '[ ] 9915 [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
blocking: []
---
# [Blocked] Autonomous agent action sandbox after cloud and Moltbook shape

# External agent action sandbox after Moltbook shape resolves

## Current Reality (2026-06-03)

The useful intent is still valid: autonomous agents may need an isolated execution/action environment before driving external surfaces, executing untrusted code, or running browser-like workflows.

The old `Dockerfile.agent` request is stale:

- The production Agent OS container topology already exists under `ai/deploy/*`.
- #9915 is the current authority for Moltbook API/MCP feasibility.
- #9297 and #9298 are blocked on identity/auth plus Moltbook integration shape.
- No dedicated `Dockerfile.agent` or `ai/demo-agents/moltbook/` implementation exists.

## Current Verdict

Keep open only as a post-research implementation ticket for an **agent action sandbox**, not as a duplicate of the cloud deployment Docker stack.

## Re-entry Gate

Before implementation:

- #9915 resolves whether Moltbook integration is API/MCP-based, browser-based, or negative ROI.
- #9297 resolves the identity/auth boundary for autonomous external actions.
- The implementation scope distinguishes:
  - cloud Agent OS service containers (`ai/deploy/*`) — already shipped baseline;
  - untrusted code execution isolation;
  - optional browser/action automation isolation.

If the resolved path does not require a separate action sandbox, close this ticket as superseded by the cloud deployment stack.

## Out of Scope

- Creating a parallel `Dockerfile.agent` that duplicates `ai/deploy/Dockerfile`.
- Treating Chrome DevTools browser automation as the default before #9915 completes.
- Adding Moltbook-specific runtime under `ai/demo-agents/` before #9298 becomes claimable.


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

- 2026-05-26T03:23:37Z @neo-gpt changed title from **Create Docker Sandbox for Autonomous Agents** to **[Blocked] Autonomous agent action sandbox after cloud and Moltbook shape**
### @neo-gpt - 2026-05-26T03:23:48Z

Retargeted this ticket to current reality instead of closing it. The baseline Dockerized Agent OS cloud stack now exists under `ai/deploy/*`, so the old `Dockerfile.agent` / `ai/demo-agents` body is stale. The remaining valid intent is narrower: a future isolated **agent action sandbox** for untrusted execution and/or browser action automation after the Moltbook integration shape is known.

Verified before update:
- `ai/deploy/Dockerfile` and compose files cover the current KB/MC/Chroma/orchestrator cloud topology.
- `learn/agentos/cloud-deployment/Day0Tutorial.md` documents the current Dockerized remote-MCP proof path.
- #9915 remains the Moltbook API/MCP feasibility authority.
- #9297 and #9298 are now blocked/stale-shape upstream siblings.
- No dedicated `Dockerfile.agent` or `ai/demo-agents/moltbook/` exists.

Current routing: blocked / needs re-triage, not claimable as a duplicate Docker-stack task.

- 2026-05-26T03:23:48Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:23:48Z @neo-gpt added the `needs-re-triage` label
- 2026-05-26T03:32:54Z @neo-gpt cross-referenced by #9295
- 2026-05-27T22:15:12Z @tobiu removed the `agent-task:blocked` label
- 2026-05-28T05:24:48Z @neo-gpt marked this issue as being blocked by #9915
- 2026-05-28T05:24:58Z @neo-gpt marked this issue as being blocked by #9297
- 2026-06-03T08:05:17Z @neo-gpt cross-referenced by #9915
- 2026-06-03T08:05:27Z @neo-gpt removed the `needs-re-triage` label

