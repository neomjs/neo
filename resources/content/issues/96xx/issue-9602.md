---
id: 9602
title: Restructure Learn Portal (tree.json) for AI-Native Onboarding and Engine Positioning
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T23:11:04Z'
updatedAt: '2026-03-31T00:29:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9602'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T00:29:52Z'
---
# Restructure Learn Portal (tree.json) for AI-Native Onboarding and Engine Positioning

## Problem
The `learn/tree.json` structure needs an overhaul to position Neo.mjs effectively for AI-Native onboarding and better surface its unique architectural advantages. Previously, AI and MCP documentation was disjointed.

## Solution
1. **Consolidated AgentOS Module**: Unify the fractured `guides/mcp` and `guides/ai` into a top-level `AgentOS` node. Put fundamental Agent capabilities at the root and encapsulate configurations in an `AgentOS/Tooling` sub-node.
2. **Restructured Top-Level Flow**: Cleaned up the hierarchy spacing and consolidated irrelevant nodes.
3. **Deferred to Separate Tickets**: The elevation of specific "Object Permanence" and "JSON First UIs" benefits was deferred. Moving the highly detailed technical guides to the top-level was confusing, so independent concise marketing stubs will be authored for them via future tickets.

## Timeline

- 2026-03-30T23:11:05Z @tobiu added the `documentation` label
- 2026-03-30T23:11:05Z @tobiu added the `enhancement` label
- 2026-03-30T23:11:05Z @tobiu added the `ai` label
- 2026-03-30T23:13:05Z @tobiu assigned to @tobiu
- 2026-03-31T00:29:31Z @tobiu referenced in commit `35d1b68` - "docs: Restructure Learn Portal for AI-Native Onboarding (#9602)"
### @tobiu - 2026-03-31T00:29:49Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ ### Task Completed
> - successfully restructured `tree.json` to extract `AgentOS` features from the generic guides folders.
> - positioned Neo vs other frameworks inside an `Engine vs Frameworks` node.
> - Deferred the elevation of specific `Object Permanence` and `JSON First UIs` metrics to separate tickets (`#9603`, `#9604`), as moving the 6-page deep-dive technical documents into the top-level `Benefits` module created a severe hierarchy imbalance.
> - Commits are pushed and structure validated.

- 2026-03-31T00:29:52Z @tobiu closed this issue

