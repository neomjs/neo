---
id: 7695
title: 'Refactor: Split Agent Instructions for Persistent Enforcement'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-02T18:57:36Z'
updatedAt: '2025-11-02T19:44:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7695'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T19:44:00Z'
---
# Refactor: Split Agent Instructions for Persistent Enforcement

**Reported by:** @tobiu on 2025-11-02

This ticket tracks the refactoring of agent instructions to ensure persistent rule enforcement. The current `AGENTS.md` will be split into two files: `AGENTS_STARTUP.md` for one-time session initialization, and `AGENTS.md` for the per-turn enforcement rules. The `.gemini/GEMINI.md` trigger file will be updated to orchestrate this new flow, importing the new `AGENTS.md` to keep the rules in the context of every turn.

