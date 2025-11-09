---
id: 7219
title: Enhance AI Scripts with Intent-Driven JSDoc Comments
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-20T10:00:28Z'
updatedAt: '2025-09-20T10:03:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7219'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-20T10:03:05Z'
---
# Enhance AI Scripts with Intent-Driven JSDoc Comments

**Reported by:** @tobiu on 2025-09-20

The three AI scripts (`createKnowledgeBase.mjs`, `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`) need to be documented with high-level, intent-driven JSDoc comments. The goal is to make the architecture, concepts, and strategies immediately clear to any new reader (human or AI). This will involve adding and refining the main class-level comments to explain the `Parse -> Score & Embed -> Query` pipeline and the role each script plays within it.

