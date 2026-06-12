---
id: 9983
title: '[Guide] Swarm Intelligence & Autonomous Sub-Agents'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T18:24:02Z'
updatedAt: '2026-04-13T22:31:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9983'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T18:31:39Z'
---
# [Guide] Swarm Intelligence & Autonomous Sub-Agents

## Summary

Add a new guide documenting the Swarm Intelligence layer — the autonomous narrow sub-agent architecture built on `Neo.ai.Agent`.

## Motivation

The Architecture Overview (#9981) covers the platform topology and the cognitive loop but treats the Agent OS as a monolithic entity. The reality is a **delegation hierarchy** where the Orchestrator spawns narrow sub-agents with constrained tool access:

- **Librarian** (Gemini/Gemma) → knowledge-base only → GraphRAG research
- **QA** (Ollama/Gemma 4, local) → knowledge-base + file-system → test generation
- **Browser** (Gemini) → chrome-devtools + neural-link → visual inspection

Key concepts that need documentation:
1. **Capability gating by model tier** — frontier models get MCP stdio, sub-agents get SDK + Zod validation
2. **Cost control** — QA runs locally on Gemma to prevent token explosion
3. **Narrow tool access = safety** — each profile declares its `servers` array, limiting blast radius
4. **Skills as Progressive Disclosure** — agents inherit skill access via the context assembler
5. **The delegation pattern** — `Agent.delegate('librarian', task)` spawning and recovery
6. **Test coverage** — Librarian.spec, QA.spec, DreamService.spec validate the architecture

## Proposed Location

Under "Agent OS & Conversational UIs" in `tree.json`, after Strategic Workflows:
- `agentos/SwarmIntelligence` (id), parentId: `AgentOS`

## A2A Context

- **Origin Session ID:** `70334eab-72c9-44a6-8f48-0b6a96604f49`
- **Related:** #9981 (Architecture Overview), discussion-9887 (Karpathy Loop)
- **Key Source Files:** `ai/Agent.mjs`, `ai/agent/profile/Librarian.mjs`, `ai/agent/profile/QA.mjs`, `ai/agent/profile/Browser.mjs`, `ai/agent/Loop.mjs`, `ai/agent/Orchestrator.mjs`

## Timeline

- 2026-04-13T18:24:03Z @tobiu added the `documentation` label
- 2026-04-13T18:24:03Z @tobiu added the `enhancement` label
- 2026-04-13T18:24:03Z @tobiu added the `ai` label
- 2026-04-13T18:26:54Z @tobiu referenced in commit `07c7874` - "docs: add Swarm Intelligence & Autonomous Sub-Agents guide (#9983)

- Documents the delegation model (Agent.delegate() lifecycle)
- Covers three profiles: Librarian, QA Bot, Browser
- Explains capability gating via server-level isolation + SDK Zod boundary
- Details cost control strategy (local vs cloud inference)
- Describes context window management and sub-agent recycling
- Includes Orchestrator pipeline and event scheduler priority system
- Registered in tree.json under Agent OS section

Resolves #9983"
- 2026-04-13T18:27:32Z @tobiu referenced in commit `94d9ee9` - "docs: add cross-link to Swarm Intelligence guide from Architecture Overview (#9983)"
- 2026-04-13T18:27:52Z @tobiu cross-referenced by PR #9984
- 2026-04-13T18:29:28Z @tobiu referenced in commit `585574e` - "docs: add Swarm Intelligence cross-reference to CodebaseOverview (#9983)"
- 2026-04-13T18:31:39Z @tobiu closed this issue
- 2026-04-13T18:51:04Z @tobiu cross-referenced by #9985
- 2026-04-13T18:51:06Z @tobiu cross-referenced by #9986
- 2026-04-13T18:59:03Z @tobiu cross-referenced by PR #9987
- 2026-04-13T22:31:42Z @tobiu assigned to @tobiu

