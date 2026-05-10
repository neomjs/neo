---
id: 9790
title: 'Swarm Network: Implement Bootstrapping Handoffs via Fat Tickets'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T13:47:06Z'
updatedAt: '2026-04-08T13:48:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9790'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T13:48:57Z'
---
# Swarm Network: Implement Bootstrapping Handoffs via Fat Tickets

### Problem
The Neo.mjs autonomous swarm runs across distributed hardware nodes (Mac 1, Mac 2) with entirely isolated SQLite vector memory backends. Consequently, secondary nodes suffer from "boot amnesia" when pulling down remote Markdown issues, lacking automatic integration into their contextual Golden Path.

### Solution
Implement the **Swarm "Fat Ticket" Startup Sequence**:
1. Introduce an `autoGoldenPath` framework configuration option to bypass standard session summarization and execute mathematical edge/graph synthesis on boot natively.
2. Wire `DreamService.initAsync()` to respect the configuration and immediately drop a deterministic `sandman_handoff.md` roadmap.
3. Enhance the `AGENTS_STARTUP.md` and `AGENTS.md` instructions to rigorously mandate the "Fat Ticket Protocol" to ensure A2A context remains persistent within Markdown elements syncing from GitHub rather than SQLite backends.

## Timeline

- 2026-04-08T13:47:07Z @tobiu added the `enhancement` label
- 2026-04-08T13:47:07Z @tobiu added the `epic` label
- 2026-04-08T13:47:08Z @tobiu added the `ai` label
- 2026-04-08T13:48:24Z @tobiu referenced in commit `039b100` - "feat: Swarm Network Fat Ticket bootstrapping and autoGoldenPath (#9790)"
- 2026-04-08T13:48:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T13:48:46Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Task complete!
> 
> - Merged `autoGoldenPath` bootstrapping into `DreamService.initAsync()`.
> - Formalized "Fat Ticket" markdown-based A2A memory propagation inside `AGENTS_STARTUP.md` and `AGENTS.md`.
> - Regression tests pass locally.
> 
> Closing this Epic out as Mac 2 is now autonomous-ready for its first Wake-Up sync!

- 2026-04-08T13:48:57Z @tobiu closed this issue

