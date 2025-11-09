---
id: 7306
title: 'Exploration Quest: Make the AI Aware of `buildScripts`'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - Saksham-chourasia
createdAt: '2025-09-28T14:13:05Z'
updatedAt: '2025-10-24T09:54:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7306'
author: tobiu
commentsCount: 3
parentIssue: 7296
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-24T09:54:55Z'
---
# Exploration Quest: Make the AI Aware of `buildScripts`

**Reported by:** @tobiu on 2025-09-28

---

**Parent Issue:** #7296 - Hacktoberfest 2025: Build Your AI Development Skills with Neo.mjs

---

This is a special "Exploration Quest" ticket. Your mission is to investigate and define the best way to make our AI agent aware of the valuable utility scripts located in the `/buildScripts` directory.

Currently, the AI has a blind spot: it does not know these tools exist, what they do, or how to use them. Your task is to solve this discovery problem.

### The Quest

Investigate at least two potential solutions:

1.  **Full Knowledge Base Integration:** This would involve modifying `buildScripts/ai/createKnowledgeBase.mjs` to parse all `.mjs` files within `/buildScripts` and add them to the vector database. This would give the AI deep, semantic knowledge of the scripts' content.

2.  **A Manifest File:** This would involve creating a new file (e.g., `buildScripts/manifest.yaml`) that lists each script with a one-sentence description of its purpose. The AI could then be taught to read this file for a high-level awareness.

Think about the pros and cons of each approach. Is deep knowledge necessary, or is simple awareness enough? What is the implementation cost of each?

**Constraint:** When considering your solution, please note that simply adding every build script to the `scripts` object in `package.json` is not a desired outcome. We are looking for a more scalable and maintainable solution.

### Acceptance Criteria

The deliverable for this quest is **not** to implement the solution yourself. Instead, the deliverable is a **Pull Request containing a single new markdown ticket file** inside the `.github/ISSUE/` directory.

This new ticket that you create should:

-   Clearly recommend one of the solutions (or a new one you devise).
-   Justify why your chosen solution is the best approach.
-   Provide a detailed, step-by-step implementation plan for another developer to follow to actually build the solution.

## Comments

### @Saksham-chourasia - 2025-10-01 19:36

Hi 👋,

I’d like to work on this issue as part of Hacktoberfest. Could you please assign it to me, please?

Thanks!

### @tobiu - 2025-10-01 23:14

Hi, thanks for the interest! For this one I would definitely recommend the "ai native" workflow and let e.g. gemini cli explore it in-depth and then reason back and forth. might be a fun experience.

### @tobiu - 2025-10-24 09:54

Hi @Saksham-chourasia,

Thank you for your interest in this ticket during Hacktoberfest.

As there has been no activity for a couple of weeks and the project’s architecture has been evolving rapidly, the core functionalities for this ticket have now been implemented as part of the main MCP server development.

We’re closing this ticket now. Thanks again for your willingness to contribute, and we hope to see you in other issues!

