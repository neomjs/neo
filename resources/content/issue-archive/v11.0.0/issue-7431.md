---
id: 7431
title: Refine Project VISION.md with Core Architectural Concepts
state: CLOSED
labels:
  - documentation
assignees:
  - tobiu
createdAt: '2025-10-09T22:02:02Z'
updatedAt: '2025-10-09T22:09:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7431'
author: tobiu
commentsCount: 0
parentIssue: 7264
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-09T22:09:36Z'
---
# Refine Project VISION.md with Core Architectural Concepts

This ticket documents the final, surgical refinements made to the `VISION.md` file. Following the initial update, this effort integrated the core technical differentiators of Neo.mjs directly into the vision's three pillars to provide a stronger architectural foundation for the strategic narrative.

The key refinements include:

1.  **Pillar 1 (Performance):** Clarified that the "Off-the-Main-Thread" (OMT) architecture is enabled by a VDOM specifically designed as a **cross-thread communication protocol**.
2.  **Pillar 2 (Simplicity):** Expanded on the **Unified Config System** to highlight that it applies to *all* classes (not just components), thus avoiding the "component-ize everything" trap common in other frameworks.
3.  **Pillar 3 (AI Partnership):** Articulated that the framework's architecture is inherently AI-native due to its use of a **JSON Blueprint** instead of JSX, making the application's structure natively understandable to LLMs.

## Timeline

- 2025-10-09T22:02:02Z @tobiu assigned to @tobiu
- 2025-10-09T22:02:03Z @tobiu added the `documentation` label
- 2025-10-09T22:02:03Z @tobiu added parent issue #7264
- 2025-10-09T22:02:39Z @tobiu referenced in commit `01f47fc` - "Refine Project VISION.md with Core Architectural Concepts #7431"
- 2025-10-09T22:09:36Z @tobiu closed this issue

