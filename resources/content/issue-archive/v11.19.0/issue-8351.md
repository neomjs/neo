---
id: 8351
title: 'Docs: Replace Framework Comparison with Engine Architecture in README'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T11:35:29Z'
updatedAt: '2026-01-07T22:20:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8351'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T22:20:05Z'
---
# Docs: Replace Framework Comparison with Engine Architecture in README

Replace the "Architectural Deep Dive" comparison table (Neo vs React/Vue) in `README.md` with a new "Engine Architecture" section.

**Why:**
With the rebranding to "Application Engine", comparing Neo.mjs to UI libraries is no longer the right frame. We need to explain the architecture in terms of an Engine (Runtime + Toolchain).

**Content Goals:**
1.  **Define the Layers:**
    *   **The Runtime (Neo.mjs Core):** Multi-threaded, VDOM-based, Persistent (The "Game Engine").
    *   **The Toolchain (Agent OS):** Neural Link, MCP Servers, Knowledge Base (The "Editor").
2.  **Explain the Synergy:** How the Toolchain introspects and mutates the Runtime (using the `toJSON` protocol and Neural Link).
3.  **Visual:** (Optional/Future) A diagram showing the Runtime and Toolchain loops.

**Source Material:**
- `tmp/STRATEGY.md` (The Runtime/Editor parallel).
- `.github/RELEASE_NOTES/v11.18.0.md` (Neural Link Architecture).

## Timeline

- 2026-01-06T11:35:30Z @tobiu added the `documentation` label
- 2026-01-06T11:35:30Z @tobiu added the `enhancement` label
- 2026-01-06T11:35:30Z @tobiu added the `ai` label
- 2026-01-06T11:36:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-06T11:36:24Z

**Input from Gemini 3 Pro:**

> ✦ I will now proceed with replacing the "Architectural Deep Dive" section.
> 
> **Plan:**
> 1.  Remove the existing comparison table.
> 2.  Draft a new section "Engine Architecture: Runtime & Toolchain".
> 3.  Use the structure:
>     *   **The Runtime (Client-Side):** Focus on the App Worker, VDOM, and Performance.
>     *   **The Toolchain (Dev-Side):** Focus on the Agent OS, Neural Link, and Context Engineering.
> 4.  Explain the "Cycle": How the Toolchain builds the Runtime.
> 
> I will iterate on the content in the next step.

- 2026-01-06T11:39:31Z @tobiu referenced in commit `8f959e3` - "Docs: Replace comparison table with Engine Architecture breakdown #8351"
### @tobiu - 2026-01-06T11:39:35Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully replaced the "Architectural Deep Dive" table with the new "Engine Architecture" section.
> 
> **Changes:**
> - Removed the React/Vue comparison table.
> - Added a clear distinction between **The Runtime** (Browser/Core) and **The Toolchain** (Node/Agent OS).
> - Re-emphasized the "Game Engine" mental model (Runtime vs Editor).
> - Explicitly highlighted **Multi-Window Orchestration** as a core runtime capability.
> 
> This completes the structural rebranding of the README.

- 2026-01-07T22:20:05Z @tobiu closed this issue

