# Tech Debt Radar Guide

This document outlines the authoritative protocol for proactive architectural sweeping and technical debt discovery natively within the Agent OS. This capability mitigates ambient architectural rot that accumulates outside the active scope of feature development.

## 1. Execution Strictures (Model Tiering)

This meta-analysis MUST be executed strictly by **Frontier Models** (e.g., Gemini 3.1 Pro / Claude Opus 4.6). The cognitive load required to synthesize historical documentation, graph topology, episodic memory, and active codebase layout exceeds the capacities of tactical open-weight Swarm SMLs. If you are an SML sub-agent, you must halt execution and escalate.

## 2. Pre-Flight: Eradicating "Unknown Unknowns"

A fresh Agent instance possesses zero intuition about the high-level framework topology. Before diving into semantic sweeps, you MUST establish a mental map to prevent hallucinated debt.

**Mandatory Action:** You MUST use the `view_file` tool to read `learn/benefits/ArchitectureOverview.md`. This establishes the structural baseline (Runtime Engine vs. Agent OS, VDOM physics, etc.) required to accurately classify architectural deviations. 

## 3. The Multi-Vectored Sweep

Debt discovery requires traversing semantic artifacts that `grep` cannot understand. Execute the following vectors:

### A. Ambient Artifact Traversal
The framework stores historical context in decentralized markdown files. You MUST use the `ask_knowledge_base` tool to query against the backlog, focusing on abandoned concepts, incomplete migrations, or trailing architectural directives.
- Your target domain encompasses `resources/content/issues/` (active backlog + historical tickets and epics).
- Example strategies: "Identify partially completed feature migrations," "List architectural patterns mentioned in closed tickets that conflict with current Engine logic."

### B. Episodic Memory Mining
Code and markdown only tell half the story. The *why* is stored in Agent episodic memory.
- You MUST heavily utilize `query_raw_memories` and `query_summaries` against the Memory Core.
- Focus on finding "abandoned loops" (e.g., "Find instances where an agent attempted to refactor X but rolled back," "Locate failed Playwright hypotheses regarding Y").
- Scanning past agent internal thought processes provides the rich monologue detailing why specific debt accrued.

### C. Codebase Vertical Slicing
Based on the clues surfaced from artifacts and memory, actively dive into the codebase. 
- Target explicit topological layers (e.g., `.agents/skills`, `ai/mcp/`, `src/vdom/`).
- Seek structural anomalies: orphan test directories, legacy Configuration objects (e.g., deeply nested daemon configs instead of top-level paths), deprecated JSDoc tags, or `&&` logic that should be optional chaining `?.`.

## 4. Proactive Remediation

Once you have cataloged depreciated logic clusters, you MUST generate highly actionable, granular cleanup tickets for the swarm backlog. 

1. **Ticket Intake Bypass:** Because you are generating the initiative (not responding to one), you are bypassing the standard `ticket-intake` constraint, but you MUST still use the "Fat Ticket" protocol. 
2. **Contextual Rigor:** The generated GitHub Issues MUST document the history of why the debt exists (citing the Memory Core or historical PRs) so the tactical SML agent dispatched to fix it understands the exact architectural ROI.
3. **Use the `create_issue` tool** to submit these directly to the repository queue, properly labeling them with `enhancement` or `refactor(ai)`.
