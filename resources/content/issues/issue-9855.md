---
id: 9855
title: Implement PR-Driven Workflow Protocol
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T09:49:57Z'
updatedAt: '2026-04-10T10:13:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9855'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-10T10:13:10Z'
---
# Implement PR-Driven Workflow Protocol

**Problem:** To support accurate Retrospective Analysis (#9851) by smaller local LLMs, the swarm architecture needs to pivot away from algorithmic parsing of raw episodic memory.

**Architectural Reality:** This task formally updates `AGENTS.md` and `AGENTS_STARTUP.md` to strictly mandate asynchronous collaboration. Agents must now open Pull Requests against the `dev` branch instead of executing direct pushes to tracking branches.

**Avoided Traps:** We explicitly avoided direct evaluation of `neo_agent_sessions` logs, as utilizing Gemma 4:31B to assess a Gemini 3.1 Pro continuous session introduces dangerous algorithmic inversion and hallucination risks. Structured, human-verified PR Review comments provide a vastly safer vector map for Knowledge Base adjustments.

## Timeline

- 2026-04-10T09:49:58Z @tobiu added the `documentation` label
- 2026-04-10T09:49:58Z @tobiu added the `enhancement` label
- 2026-04-10T09:49:58Z @tobiu added the `ai` label
- 2026-04-10T09:50:24Z @tobiu referenced in commit `288baac` - "docs: Implement PR-Driven Workflow Protocol (#9855)"
- 2026-04-10T09:50:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-10T09:50:41Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ I have completed the targeted architectural mandates to enforce human-reviewed PR workflows for Agents and pushed them to a dedicated tracking branch. 
> 
> **Resolving Pull Request:**
> This issue is effectively resolved via PR #9856. Handoff to human review is now fully complete!

- 2026-04-10T10:05:36Z @tobiu cross-referenced by PR #9856
- 2026-04-10T10:05:51Z @tobiu referenced in commit `caf2827` - "Merge pull request #9856 from neomjs/agent/9855-pr-workflow

docs: Implement PR-Driven Workflow Protocol (#9855)"
### @tobiu - 2026-04-10T10:13:09Z

Closed manually as PR #9856 was merged without the auto-closing keyword.

- 2026-04-10T10:13:10Z @tobiu closed this issue
- 2026-04-10T10:13:30Z @tobiu cross-referenced by #9859

