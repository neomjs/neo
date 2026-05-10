---
id: 8376
title: Add Mermaid Diagram Support to Markdown Component
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T11:30:09Z'
updatedAt: '2026-01-07T14:42:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8376'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T12:05:31Z'
---
# Add Mermaid Diagram Support to Markdown Component

To support the new Neural Link documentation, we need to enable Mermaid diagram rendering within our Markdown component.

**Architecture:**
1.  **Dependency:** Add `mermaid` to `package.json`.
2.  **App Worker (`Markdown.mjs`):** Detect `mermaid` code blocks and replace them with placeholder VDOM elements (e.g., `<div class="neo-mermaid">code</div>`).
3.  **Main Thread (`Neo.main.addon.Mermaid`):** Create a new addon to handle the actual rendering, as Mermaid requires DOM access which is not available in the App Worker.
4.  **Integration:** The Markdown component will trigger the main thread addon to render the diagrams after the content is mounted.

## Timeline

- 2026-01-07T11:30:10Z @tobiu added the `documentation` label
- 2026-01-07T11:30:10Z @tobiu added the `enhancement` label
- 2026-01-07T11:30:10Z @tobiu added the `ai` label
- 2026-01-07T12:05:31Z @tobiu closed this issue
### @tobiu - 2026-01-07T12:05:54Z

<img width="735" height="740" alt="Image" src="https://github.com/user-attachments/assets/15842bd6-1dbe-4465-b8fd-d6f4a7ef75ae" />

- 2026-01-07T13:25:10Z @jonnyamsp referenced in commit `047f56b` - "feat: Add Mermaid diagram support to Markdown component

Implements support for rendering mermaid diagrams within markdown content using the 'mermaid' code block syntax. This involves a new App worker logic to identify blocks and a new Main thread addon to handle the rendering via the mermaid library.

Closes #8376"
- 2026-01-07T14:42:07Z @tobiu assigned to @tobiu

