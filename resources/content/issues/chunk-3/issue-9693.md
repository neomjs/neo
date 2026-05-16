---
id: 9693
title: '[Epic] AI Agent Phase 3: Ideation Sandbox via GitHub Discussions'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T14:49:03Z'
updatedAt: '2026-04-04T18:02:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9693'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9695 Implement Offline Synchronization for Ideation Sandbox (Discussions)'
  - '[x] 9698 Feature: Agent Skill Loader & Ideation Sandbox'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-04T18:02:43Z'
---
# [Epic] AI Agent Phase 3: Ideation Sandbox via GitHub Discussions

### Background
Currently, the AI agent is tightly coupled to creating and scanning actual GitHub Issues for managing its context and workflows. However, "hallucinating" or proposing highly exploratory architectural node ideas pollutes the actionable Issue tracker and ruins velocity metrics.

### Objective
Implement Phase 3 of the AI Agent infrastructure: **The Ideation Sandbox.**
Instead of polluting the actionable Issue tracker, the agent should utilize **GitHub Discussions** as its native "brainstorming" and "what-if" playground.

### Requirements
- [ ] Connect the AI Agent ecosystem (via `github-workflow` MCP or `DreamService`) to the GitHub GraphQL / Discussions API.
- [ ] Allow the agent to spin up Discussion threads for structural pattern exploration (unknown unknowns) without affecting open issue counts.
- [ ] Implement a promotion mechanism that allows manual or metric-driven conversion of a Discussion into an actionable Epic/Issue on the main roadmap.

## Timeline

- 2026-04-04T14:49:04Z @tobiu added the `epic` label
- 2026-04-04T14:49:05Z @tobiu added the `ai` label
- 2026-04-04T14:50:20Z @tobiu assigned to @tobiu
- 2026-04-04T15:14:57Z @tobiu added sub-issue #9695
- 2026-04-04T16:18:30Z @tobiu added sub-issue #9698
### @tobiu - 2026-04-04T18:02:42Z

Ideation Sandbox Phase 3 implemented natively

- 2026-04-04T18:02:43Z @tobiu closed this issue

