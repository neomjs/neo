---
id: 7432
title: Refine and Align Core Project Documentation (VISION.md & README.md)
state: CLOSED
labels:
  - documentation
assignees:
  - tobiu
createdAt: '2025-10-09T22:45:25Z'
updatedAt: '2025-10-09T22:46:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7432'
author: tobiu
commentsCount: 0
parentIssue: 7264
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-09T22:46:53Z'
---
# Refine and Align Core Project Documentation (VISION.md & README.md)

**Reported by:** @tobiu on 2025-10-09

---

**Parent Issue:** #7264 - Enhance Development Workflow with a Planning Phase

---

This ticket documents a comprehensive effort to refine and align the project's core strategic and introductory documents: `VISION.md` and `README.md`. The goal was to increase clarity, strengthen architectural claims with proof, and ensure the messaging is both powerful and timeless.

### `VISION.md` Refinements

The vision was updated to be more explicit about its foundational architectural principles, making it more credible and defensible without losing its inspirational tone.

- **Performance Pillar:** The claim of "elite performance" was substantiated by making a bold, direct statement about **order-of-magnitude performance improvements** and linking it directly to the benchmark blog post as evidence.
- **Architectural Principles:** The core philosophies were woven directly into the narrative, including:
    - The **Actor Model** as the solution to the "tyranny of the main thread."
    - The **JavaScript-first** approach (persistent instances projecting the UI).
    - The **VDOM as a lightweight, necessary protocol** for any true multi-threaded architecture.
- **AI Pillar:** The connection between the JSON Blueprint and its real-world application was strengthened by hinting at the orchestration of **multi-window interfaces**.
- **Clarity:** The "Zero-Builds Workflow" was clarified to apply specifically to the **development** experience.

### `README.md` Refinements

The README was updated to be more evergreen, more precise, and better integrated with the project's strategic documents.

- **Timeless Messaging:** All references to "v10" were removed from headers and feature descriptions to ensure the document does not become dated.
- **Strategic Alignment:** A new **"Vision & Roadmap"** section was added to provide a clear path for developers to understand the project's long-term goals.
- **AI Strategy:** The "AI-Native by Design" section was replaced with a more professional and specific explanation of **Context Engineering**, articulating the deliberate system being built to enable AI collaboration while carefully preserving all links to existing guides.

