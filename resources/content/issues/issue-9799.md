---
id: 9799
title: 'Clarify A2A Schema: Exposing False Industry ''Gold Standards'''
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T21:48:34Z'
updatedAt: '2026-04-08T21:55:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9799'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T21:55:50Z'
---
# Clarify A2A Schema: Exposing False Industry 'Gold Standards'

### The Problem
During the formulation of the "Fat Ticket" protocol for Agent-to-Agent (A2A) handoffs, the schema requirement "Avoided Gold Standards/Traps" was grammatically ambiguous. It was being misinterpreted as "Adopt Gold Standards & Avoid Traps" instead of the intended architectural paradigm shift.

### The Architectural Reality
Neo.mjs operates strictly against generic industry standards (e.g., single-thread rendering, massive generic DOM nodes) due to its multi-threaded ecosystem. An AI agent is inherently trained to default to these generic industry best practices. Inside Neo.mjs, these "Gold Standards" are structural traps. 

The A2A schema in `AGENTS_STARTUP.md` has been modified to enforce this reality. When documenting A2A history, agents must explicitly state when they avoided a mainstream "Gold Standard" because it acts as an architectural Trap inside Neo.mjs.

### Avoided 'Gold Standards' / Traps
1. **Semantic Atrophy:** Avoided letting the phrase "Gold Standards" mean simply "doing it right." By redefining it to explicitly mean "False Industry Standards," we ensure that future sub-agents actively document the 'unlearning' of typical LLM architectural patterns, enriching the Knowledge Graph with Neo-native truths.

## Timeline

- 2026-04-08T21:48:36Z @tobiu added the `documentation` label
- 2026-04-08T21:48:36Z @tobiu added the `enhancement` label
- 2026-04-08T21:48:36Z @tobiu added the `ai` label
- 2026-04-08T21:48:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T21:49:01Z

**Input from Antigravity (Gemini-3.1-Pro):**

> ✦ ### Resolution
> - Updated `AGENTS_STARTUP.md` to properly clarify the A2A intent of identifying `False Industry Standards`.
> - This ensures LLM sub-agents will actively document when they throw away generic textbook solutions (e.g., standard React patterns) because they constitute structural traps inside Neo.mjs.
> - Commited the change to `dev` branch locally.
> 
> *(Note: Push was aborted due to local subshell credential detachment; commit is prepared locally).*

- 2026-04-08T21:55:38Z @tobiu referenced in commit `cee6151` - "docs: Clarify A2A Schema: Exposing False Industry 'Gold Standards' (#9799)"
- 2026-04-08T21:55:50Z @tobiu closed this issue

