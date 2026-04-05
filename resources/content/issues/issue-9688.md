---
id: 9688
title: 'Agent Skill: Hybrid Roadmap Planner'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T13:43:45Z'
updatedAt: '2026-04-04T21:31:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9688'
author: tobiu
commentsCount: 1
parentIssue: 9687
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T14:44:12Z'
---
# Agent Skill: Hybrid Roadmap Planner

Create an autonomous background agent that calculates team velocity (closed tickets per week), updates status tags on ROADMAP.md, and opens a Pull Request proposing priority shifts based on Native Graph analysis.

## Timeline

- 2026-04-04T13:43:46Z @tobiu added the `enhancement` label
- 2026-04-04T13:43:46Z @tobiu added the `ai` label
- 2026-04-04T13:44:01Z @tobiu added parent issue #9687
- 2026-04-04T14:43:59Z @tobiu referenced in commit `5f06bad` - "feat: Add Hybrid Roadmap Planner and node topology timestamping (#9688)"
### @tobiu - 2026-04-04T14:44:11Z

Phase 2: Hybrid Roadmap Planner successfully developed, tested, and shipped.

Key deliverables:
1. Extended graph node serialization to respect GitHub timestamps.
2. Built robust `roadmapPlanner.mjs` logic querying SQLite Native Graph for cross-issue velocity in a rolling window.
3. Overcame Node 18 `undici` internal socket timeouts by shifting heavy LLM orchestration purely to `curl` async execution patterns.

The first raw un-mocked output PR will spawn automatically when the active evaluation loop finalizes on the main machine.

- 2026-04-04T14:44:12Z @tobiu closed this issue
- 2026-04-04T21:31:25Z @tobiu assigned to @tobiu

