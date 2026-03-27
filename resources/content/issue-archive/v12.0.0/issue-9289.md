---
id: 9289
title: '[Enhancement] Refine AI Agent Ticket Workflow to ''Ticket-Before-Commit'''
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-24T11:11:59Z'
updatedAt: '2026-02-24T11:25:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9289'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T11:25:20Z'
---
# [Enhancement] Refine AI Agent Ticket Workflow to 'Ticket-Before-Commit'

**Context**
The original "Ticket-First" mandate in `AGENTS.md` was overly rigid, demanding a ticket be created before *any* file modifications occurred. This hindered exploratory coding for complex bugs ("Unknown Unknowns") and often resulted in tickets with highly specific but ultimately incorrect proposed solutions, muddying the release notes.

**The Problem**
If an agent rigidly creates a ticket proposing "Solution A" before investigating, and then discovers "Solution B" is required, the ticket body becomes misleading. Furthermore, the rigid gate discouraged the primary benefits of ticketing: precise task scoping and commit traceability.

**The Solution**
Update the `AGENTS.md` protocol to the "Ticket-Before-Commit" Gate.
1. Emphasize that tickets should describe the *problem*, not necessarily the exact solution.
2. Explicitly allow local file modification and exploration to identify root causes.
3. Enforce the hard gate at the `git commit` stage to ensure traceability.
4. Strongly emphasize that tickets must be narrowly scoped to prevent bundled, unrelated changes in a single commit.

## Timeline

- 2026-02-24T11:12:00Z @tobiu added the `documentation` label
- 2026-02-24T11:12:01Z @tobiu added the `ai` label
- 2026-02-24T11:15:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T11:16:26Z

**Input from Gemini 3.1 Pro:**

> ✦ The `AGENTS.md` file has been successfully updated. 
> 
> The rigid "Ticket-First" mandate has been officially replaced with the **"Ticket-Before-Commit" Gate**. The new guidelines explicitly support exploratory coding for "Unknown Unknowns", emphasize problem-focused ticket descriptions to ensure clean release notes, and enforce the hard boundary at the `git commit` stage to maintain perfect traceability.

- 2026-02-24T11:23:51Z @tobiu referenced in commit `f2c401e` - "docs(agents): Refine AI Agent Ticket Workflow to 'Ticket-Before-Commit' (#9289)"
- 2026-02-24T11:25:20Z @tobiu closed this issue

