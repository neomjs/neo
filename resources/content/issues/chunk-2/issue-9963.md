---
id: 9963
title: Agent Health Observability Dashboard
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T11:13:20Z'
updatedAt: '2026-04-13T11:13:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9963'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9962 PR Outcome Tracker — Reward Signal for RLAIF Pipeline'
blocking: []
---
# Agent Health Observability Dashboard

### Problem

There is no way to answer: **"Is the agent system actually getting better over time?"**

We have 7,789 memories and 740 session summaries but no trend analysis. Are sessions getting more productive? Are PR acceptance rates improving? Is the knowledge base keeping pace with the codebase? Without these metrics, "self-evolving system" is an aspiration, not a measurable claim.

### Proposal

Generate an `agent_health_metrics.json` file (or extend `sandman_handoff.md`) with longitudinal metrics produced by `DreamService` during the REM cycle.

#### Proposed Metrics

| Metric | Source | What It Measures |
|---|---|---|
| **Session Quality Trend** | 30-day moving average of `quality` scores from session summaries | Are agents producing higher-quality work? |
| **Productivity Trend** | 30-day moving average of `productivity` scores | Are agents getting more done per session? |
| **Memory Retrieval Hit Rate** | % of `query_raw_memories` calls that return results with distance < 0.5 | Is the memory actually useful? |
| **PR Acceptance Rate** | % of agent PRs merged without requested changes (requires #PR_OUTCOME_TRACKER) | Is the code production quality improving? |
| **Knowledge Base Coverage** | `count(indexed_files) / count(total_source_files)` | Is the KB keeping pace? |
| **Graph Density** | `edges / nodes` ratio over time | Is structural understanding growing or decaying? |
| **Summarization Health** | % of sessions successfully summarized within 24h | Is the REM pipeline reliable? |

#### Implementation

1. **Data Collection:** All metrics derive from existing data sources (ChromaDB collections, SQLite graph, GitHub API).
2. **Computation:** Add a `computeHealthMetrics()` method to `DreamService` that runs at the end of the REM cycle.
3. **Output:** Write to `resources/content/agent_health_metrics.json` — this makes it available to the Sandman handoff dashboard (#9952) and to agents via the knowledge base.
4. **Alerting:** If any metric drops below a threshold (e.g., summarization health < 80%), inject a `[SYSTEM_ALERT]` into the handoff file.

### A2A Context
Origin Session ID: `fff6dc5b-ca7f-4c9b-8eca-41bd8a97ad5d`

## Timeline

- 2026-04-13T11:13:21Z @tobiu assigned to @tobiu
- 2026-04-13T11:13:22Z @tobiu added the `enhancement` label
- 2026-04-13T11:13:22Z @tobiu added the `ai` label
- 2026-04-13T11:13:35Z @tobiu marked this issue as being blocked by #9962

