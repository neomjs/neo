---
title: Define Hybrid API vs. Knowledge Base Workflow for Agent
labels: documentation, enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7376

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 4
**Status:** To Do

## Description

The agent will have access to two sources of information for issues and PRs: the real-time GitHub API (via `gh`) and the local, semantic-search-optimized knowledge base. To prevent confusion and ensure optimal performance, the agent needs a clear, documented strategy on when to use each. This ticket is to create that "Discover, then Verify" protocol.

## Acceptance Criteria

1.  A new workflow is added to `AGENTS.md`.
2.  The workflow instructs the agent to use the local knowledge base (`ai:query`) for broad, contextual, or semantic searches (Discovery).
3.  The workflow instructs the agent to use the GitHub CLI (`gh`) to get the real-time status (e.g., open/closed, assignees, labels) of a *specific* issue or PR that it has already discovered (Verification).
4.  The protocol should include a clear example of this two-step "Discover, then Verify" process.
