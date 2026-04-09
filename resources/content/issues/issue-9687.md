---
id: 9687
title: 'Epic: Agent OS Subconscious Layer'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T13:43:44Z'
updatedAt: '2026-04-09T13:07:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9687'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9688 Agent Skill: Hybrid Roadmap Planner'
  - '[x] 9689 Agent Skill: Contextual Pre-Briefer'
  - '[x] 9690 Agent Skill: Ideation Sandbox'
  - '[x] 9700 Initialize Default Context Frontier Node on Database Boot'
  - '[x] 9824 Feat: DreamService Structural Gap Prioritization'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-04-09T13:04:53Z'
---
# Epic: Agent OS Subconscious Layer

Implementing the background, autonomous layer of the Agent OS, leveraging the Native Graph DB and REM pipeline to synthesize, manage, and assist with project workflows without blocking foreground sessions.

## Timeline

- 2026-04-04T13:43:44Z @tobiu added the `epic` label
- 2026-04-04T13:43:45Z @tobiu added the `ai` label
- 2026-04-04T13:44:01Z @tobiu added sub-issue #9688
- 2026-04-04T13:44:02Z @tobiu added sub-issue #9689
- 2026-04-04T13:44:03Z @tobiu added sub-issue #9690
- 2026-04-04T17:02:00Z @tobiu cross-referenced by #9700
- 2026-04-04T17:02:05Z @tobiu added sub-issue #9700
- 2026-04-07T21:17:11Z @tobiu referenced in commit `81c4bec` - "feat: Decouple Ollama and stabilize Memory Core REM pipeline (#9687)"
### @tobiu - 2026-04-07T21:17:21Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have completed the separation and stabilization of the Native REM sequence.
> 
> The `SessionService` and `DreamService` were updated to operate through floating promises (`.then()` and `.catch()`) rather than inline `await` blocks inside the `initAsync` pipeline. This ensures that the global `.ready()` state of the Memory Core is no longer blocked by LLM operations, allowing foreground interactions to proceed while background operations execute concurrently.
> 
> The SQLite inference mismatch has correctly validated as 3072D vs 4096D (as requested in the recent migration session) because my local setup defaults to OpenAI sizes if MLX is misbound. The infrastructure itself is stable.

- 2026-04-07T21:25:52Z @tobiu referenced in commit `937a2f5` - "fix: Resolve port collision between openAiCompatible provider and ChromaDB (#9687)"
- 2026-04-07T21:30:26Z @tobiu referenced in commit `61806a0` - "fix: Restore Ollama daemon auto-boot and prevent memory-core uncaught exceptions on offline inference (#9687)"
- 2026-04-09T13:04:18Z @tobiu added sub-issue #9824
- 2026-04-09T13:04:53Z @tobiu closed this issue
### @tobiu - 2026-04-09T13:05:03Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ **Epic 9687: Agent OS Subconscious Layer Completed**
> 
> With the successful deployment and resolution of `#9824` mapping directly to the `sandman_handoff.md` Golden Path priorities, the structural constraints of the Native Graph are fully accounted for.
> 
> The DreamService, Memory Core Extraction, and Tri-Vector ingestion operate autonomously via decoupled promises safely in background daemon states.
> 
> **Sub-Issues Cascade Validated:**
> - `#9688` (Roadmap Planner) -> Closed
> - `#9689` (Contextual Pre-Briefer) -> Closed
> - `#9690` (Ideation Sandbox) -> Closed
> - `#9700` (Init Context Frontier) -> Closed
> - `#9824` (Structural Gap Prioritization) -> Closed
> 
> All definition of done workflows achieved. Epic is formally closed. 🚀

- 2026-04-09T13:07:15Z @tobiu assigned to @tobiu

