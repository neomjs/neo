---
id: 7235
title: Refine AI Agent Guidelines for Query-Driven Comments
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T11:49:14Z'
updatedAt: '2025-09-23T11:50:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7235'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-23T11:50:52Z'
---
# Refine AI Agent Guidelines for Query-Driven Comments

**Reported by:** @tobiu on 2025-09-23

## Description

The `AGENTS.md` file, which serves as the constitution for AI agents, was enhanced to improve the quality and discoverability of generated documentation.

## Changes
- The "Knowledge Base Enhancement Strategy" was renamed to "Contributing Queryable, Intent-Driven Comments" to better reflect its goal.
- A new step, "Anticipate Future Queries," was added. This instructs agents to enrich class-level comments with conceptual keywords (e.g., `reactivity`, `state management`) to act as "semantic signposts" for the knowledge base search.
- The documentation generation step was updated to mandate the use of structured JSDoc tags, specifically `@summary` for a concise overview and `@see` to link to related code or guides.
- The example in the `AGENTS.md` file was updated to reflect this new, higher standard for query-driven comments.

## Impact
This change formalizes a more advanced documentation strategy, ensuring that all future AI-driven documentation contributions will not only explain the code but also significantly improve the semantic richness and discoverability of the knowledge base.

