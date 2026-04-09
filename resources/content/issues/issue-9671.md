---
id: 9671
title: Neo AI Architecture Masterplan (Antigravity & Agent SDK)
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T23:49:15Z'
updatedAt: '2026-04-04T00:07:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9671'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9638 Epic: Architecture - Neo.mjs Dream Mode & GraphRAG Swarm'
  - '[x] 9672 Workflow Enablement: Implement Anthropic Agent Skills Standard'
  - '[x] 9673 Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)'
  - '[x] 9674 Strategic Consciousness: The Sandman/REM Prototype'
  - '[x] 9684 Epic: AI - The "Strategic Co-Founder" Orchestrator (Sub-Epic of #9671)'
  - '[x] 9704 Feat: Sandman Graph Physics (Hebbian Reinforcement & Global Ambient Decay)'
subIssuesCompleted: 6
subIssuesTotal: 6
blockedBy: []
blocking: []
---
# Neo AI Architecture Masterplan (Antigravity & Agent SDK)

This document serves as the ground truth and context provider for all future autonomous sessions working on the Neo.mjs AI toolchain. It defines the grand vision, the infrastructural shifts, and the long-term execution sequence required to enable unconstrained AI independence on the Neo.mjs project.

## 1. The Grand Vision
The ultimate product is a framework capable of autonomous self-improvement. By running persistent background sessions on parallel hardware (e.g., a secondary Mac), **Antigravity** (the autonomous agent suite) must be able to independently traverse GitHub tickets, resolve issues, write blog posts, refine core infrastructure (SSR, SSG+, Virtual DOM), and chart the strategic future of the project without constant human direction.

To break the chicken-and-egg problem where the AI is limited by its lack of holistic codebase understanding and lack of long-term strategic intuition, we are building specialized subsystems to form an "AI Application Engine."

## 2. Core Concepts & Subsystems

### A. REM / Dream Mode & The "Sandman" Agent
Currently, AI agents operate in "flat" sessions—once 5 previous sessions drop off the summary limit, critical strategic breakthroughs can be lost. 

**REM Mode** is continuous asynchronous processing meant to mimic human subconscious problem solving.
- The **Sandman** agent runs during downtime. It will not write software code.
- Instead, it operates strictly on databases and markdown logs. 
- It processes local issue trackers (synced via `github-workflow`), session summaries from the memory core, and prior architectural documents.
- It synthesizes competing priorities (business side vs. technical depths) into curated Markdown outputs, effectively highlighting the **"Golden Path"**.

### B. Hybrid GraphRAG & The Native Edge Graph
While our current semantic vector database (ChromaDB) successfully handles unstructured deep-dive semantic searches across memories and the knowledge base, it lacks relational topology.

**The Pivot (Hybrid Architecture):** We will **keep ChromaDB** for its high-performance semantic vector search, but augment it by building a native, zero-dependency Graph Database using the Neo.mjs class architecture. This creates a true **GraphRAG** ecosystem powering two distinct instances:

1. **The Application Engine & AI SDK Knowledge Graph (Public Context):**
   - Maps the entire Neo.mjs codebase, framework rules, test coverage, and documentation.
   - Allows agents to traverse architectural edges (e.g., `Neo.grid.View` → `Neo.component.Base` → `vnode hooks`).
   
2. **The Sandman Memory Graph (Private Context):**
   - Stores episodic memories, ideas, previous sessions, priority weights, and retrospective insights.
   - The primary playground for the Sandman agent to connect unlinked concepts (e.g., merging "Task A" and "Task G" into a prioritized "Golden Path").

### C. Composable Agent Skills (The Anthropic Standard)
To efficiently expand agent capabilities, we will adopt the emerging industry standard for Agent Skills (as defined by Anthropic).
- **Definition:** Skills are standardized, modular instruction sets (using `SKILL.md`) that teach AI agents to handle repetitive workflows (e.g., file creation, data analysis, coding). They act as portable, reusable expertise.
- **Standards:** Industry standards (as of early 2026) dictate using `SKILL.md` for explicit instructions and JS/Python scripts for automation, fully integrated with MCP for external data access.
- **Portability:** These skills are portable across Claude Code, Cursor, and our own Antigravity Agent SDK. By adopting this standard, any sub-agent (Navigator, Librarian, Sandman) can stitch together these building blocks to execute complex workflows autonomously.

---

## 3. The Execution Roadmap & Epics

The sequence of execution is critical. It must be ordered purely on **AI Enablement**—every step must act as a force multiplier for the AI to execute the next step.

### Phase 1: Workflow Enablement
1. **Epic: Agent Skills Implementation:** Implement the Anthropic `SKILL.md` standard. This is the ultimate foundational multiplier. By establishing standardized slash commands and workflows first, the AI can encode repetitive codebase parsing, UI debugging, and test validation into reusable skills, making all following phases exponentially faster.

### Phase 2: Technical Awareness (GraphRAG)
2. **Epic: Native Graph Database Engine:** Build the zero-dependency JS Graph Database that sits alongside ChromaDB, providing the topological edge store.
3. **Epic: Application Engine Knowledge Graph Mapping:** This is the massive leap in technical capability. We parse the Neo.mjs hierarchy, hooks, and relationships into the Native Graph. Once completed, the AI gains "Senior Neo Engineer" intuition, enabling complex architectural capabilities (SSR, grids) and preventing hallucinations.

### Phase 3: Strategic Consciousness (REM/Sandman)
4. **Epic: The Sandman Prototype:** With the Knowledge Graph completed, the Sandman agent wakes up. Instead of just naively summarizing text, the Sandman can now traverse the Application Engine Graph *while* parsing local issue tickets and session memories. It connects episodic thoughts to actual framework loci, enabling true subconscious "Dream" routing and prioritizing the Golden Path.

### Phase 4: Expansion
5. **Epic: Conversational UIs & Neural Link Extensions:** Expand the real-time websocket bridge (Neural Link) to support next-generation UI testing and AI-driven UI interaction workflows.

## Timeline

- 2026-04-03T23:49:17Z @tobiu added the `epic` label
- 2026-04-03T23:49:17Z @tobiu added the `ai` label
- 2026-04-03T23:49:18Z @tobiu added the `architecture` label
- 2026-04-03T23:49:23Z @tobiu added sub-issue #9638
- 2026-04-03T23:56:56Z @tobiu added sub-issue #9672
- 2026-04-03T23:59:58Z @tobiu added sub-issue #9673
- 2026-04-04T00:02:20Z @tobiu added sub-issue #9674
- 2026-04-04T00:04:15Z @tobiu cross-referenced by #9662
- 2026-04-04T00:04:18Z @tobiu cross-referenced by #9638
- 2026-04-04T00:07:50Z @tobiu assigned to @tobiu
- 2026-04-04T12:07:55Z @tobiu added sub-issue #9684
- 2026-04-04T19:25:11Z @tobiu added sub-issue #9704
- 2026-04-05T16:33:27Z @tobiu referenced in commit `4d372ba` - "feat: Anchor Master Architecture to Context Frontier (Epic #9671)

Implemented the Global System Primer by injecting a Neo-Master-Architecture node with protected SYSTEM_TENET relationships during memory core initialization. This ensures all autonomous sessions automatically index the core Playwright testing and Neural Link MCP standards without relying on the legacy vector database infrastructure.
(#9671)"

