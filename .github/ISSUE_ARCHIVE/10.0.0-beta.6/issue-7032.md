---
id: 7032
title: 'Feature: Add Neo.mjs vs. React Comparison Article'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T21:15:48Z'
updatedAt: '2025-07-12T22:15:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7032'
author: tobiu
commentsCount: 1
parentIssue: 7029
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-12T22:15:55Z'
---
# Feature: Add Neo.mjs vs. React Comparison Article

**Reported by:** @tobiu on 2025-07-12

---

**Parent Issue:** #7029 - Feature: Add Framework Comparison Articles to Learn Directory

---

**Is your feature request related to a problem? Please describe.**
React is currently the most dominant JavaScript UI library. Developers evaluating or learning Neo.mjs often come from a React background and need a clear, concise comparison that bridges their existing knowledge to Neo.mjs concepts and highlights Neo.mjs's unique advantages.

**Describe the solution you'd like**
Add a new article within the `learn/comparisons` directory comparing Neo.mjs with React. The article should:

*   **Bridge Knowledge Gaps:** Explain how concepts familiar from React (e.g., functional components, hooks, JSX, Virtual DOM) map to Neo.mjs.
*   **Highlight Differentiators:** Clearly articulate Neo.mjs's unique selling points (e.g., worker-based architecture, fine-grained reactivity, Main Thread responsiveness, VDOM approach, batching/aggregation, zero-build dev mode) in contrast to React.
*   **Provide Side-by-Side Analysis:** Use structured sections to compare key aspects like rendering mechanism, component execution model, overall architecture, state management, and update aggregation/batching.
*   **Discuss Trade-offs:** Acknowledge any trade-offs or scenarios where one framework might be preferred over another.
*   **Suggest Use Cases:** Guide developers on when Neo.mjs might be the optimal choice, particularly emphasizing its technical superiority in areas like Main Thread responsiveness and performance under heavy load.

**Describe alternatives you've considered**
(None considered, as this is the proposed solution.)

**Additional context**
This article will be crucial for attracting React developers to Neo.mjs, enhancing discoverability, and positioning Neo.mjs as a technically superior alternative for specific use cases.

**Affected Files (Conceptual):**
*   `learn/comparisons/NeoVsReact.md` (new file)
*   `learn/comparisons/Overview.md` (will be updated to include this link)

## Comments

### @tobiu - 2025-07-12 21:57

reopening for adding zero dependencies

