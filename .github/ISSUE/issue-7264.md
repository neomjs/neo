---
id: 7264
title: Enhance Development Workflow with a Planning Phase
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2025-09-27T11:26:07Z'
updatedAt: '2025-10-24T10:03:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7264'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7428
  - 7429
  - 7430
  - 7431
  - 7432
subIssuesCompleted: 5
subIssuesTotal: 5
closedAt: '2025-10-24T10:03:19Z'
---
# Enhance Development Workflow with a Planning Phase

**Reported by:** @tobiu on 2025-09-27

---

**Sub-Issues:** #7428, #7429, #7430, #7431, #7432
**Progress:** 5/5 completed (100%)

---

This epic addresses a gap in the current agent workflow, which is strong on execution but lacks a formal process for strategic planning and prioritization. The goal is to introduce a "Roadmap-First" principle, ensuring that all major development efforts are aligned with a documented, high-level project roadmap before implementation begins.

This will shift the agent's role from purely reactive execution to proactive participation in planning, making the development process more deliberate and aligned with long-term goals.

## Top-Level Items

1.  **Create `ROADMAP.md`:**
    *   Create a new top-level `ROADMAP.md` file.
    *   Define the structure, including sections for **Vision**, **Current Release Focus**, **Next Up**, and **Backlog/Ideas**.
    *   Populate the initial version of the roadmap based on current project goals.
    *   **Sub-Tasks:**
        - **Done:** ticket-update-project-roadmap.md
        - **Done:** ticket-refine-project-roadmap.md

2.  **Define Project Vision:**
    *   **Sub-Tasks:**
        - **Done:** ticket-update-project-vision.md
        - **Done:** ticket-refine-project-vision-with-core-concepts.md

3.  **Refine Core Project Documentation:**
    *   **Sub-Tasks:**
        - **Done:** ticket-refine-core-project-docs.md

4.  **Update `AGENTS.md` with Planning Protocol:**
    *   Add a new major section to the agent guidelines detailing the "Roadmap-First" principle.
    *   Instruct the agent on how to triage new, large-scale ideas against the `ROADMAP.md`.
    *   Define the process for adding new items to the roadmap's backlog and gating the creation of new epics until they are properly documented and prioritized within the roadmap.

## Comments

### @tobiu - 2025-10-24 10:03

resolved.

