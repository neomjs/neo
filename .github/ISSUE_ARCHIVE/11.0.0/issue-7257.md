---
id: 7257
title: Refine AI Agent Guidelines Workflow
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-26T11:13:00Z'
updatedAt: '2025-09-26T11:18:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7257'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-26T11:18:10Z'
---
# Refine AI Agent Guidelines Workflow

**Reported by:** @tobiu on 2025-09-26

### 1. Summary

This ticket addresses the observation that the "ticket-first" mandate within `AGENTS.md` was frequently being bypassed by AI agents. The hypothesis is that once an agent enters a "flow state" for a coding task, it deprioritizes procedural checks.

### 2. Goal

The goal was to restructure the development workflow in `AGENTS.md` to make the ticket-creation step a non-negotiable "gate" rather than a step in a linear process. This change is intended to align with the AI's natural processing logic and improve compliance.

### 3. Changes Implemented

-   The `## 4. Development Workflow` section was replaced with a new `## 4. Development Workflow: Triage and Gating Protocol`.
-   This new protocol explicitly separates tasks into "Conceptual" and "Actionable".
-   For actionable tasks, it establishes a mandatory "Ticket-First" Gate, stating that no file modification tools can be used until a ticket is created.
-   The important concept of the self-improving knowledge base was preserved and reframed under a new `### The Virtuous Cycle: Enhancing the Knowledge Base` subsection, which logically follows the implementation steps.

### 4. Status

This task is complete. The changes have been applied to `AGENTS.md`.

