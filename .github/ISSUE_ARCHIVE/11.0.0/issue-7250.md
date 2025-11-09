---
id: 7250
title: Improve Agent Information Discovery Protocol
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-24T11:22:58Z'
updatedAt: '2025-09-24T11:24:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7250'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-24T11:24:05Z'
---
# Improve Agent Information Discovery Protocol

**Reported by:** @tobiu on 2025-09-24

To improve the agent's ability to efficiently answer high-level conceptual questions, its information discovery protocol will be updated. The agent's previous process was inefficient, requiring multiple queries and user feedback to identify the most important architectural documents.

## Goal

Modify `AGENTS.md` to make the agent's information-gathering process more robust and intelligent, ensuring it can identify and prioritize foundational "pillar content" on its own.

### Changes to `AGENTS.md`:

1.  **Add `tree.json` Consultation Step:** A new instruction will be added requiring the agent to first consult `learn/tree.json` for high-level conceptual questions. This will provide the agent with a map of the project's intended information architecture.

2.  **Enhance Initial Query Strategy:** The "Discovery Pattern" will be updated with a more prescriptive initial step, forcing the agent to query for foundational terms like "benefits", "concept", and "architecture" before narrowing its search.

