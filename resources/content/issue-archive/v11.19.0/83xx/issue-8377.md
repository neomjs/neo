---
id: 8377
title: Create Mermaid Component Wrapper
state: CLOSED
labels:
  - enhancement
  - feature
assignees:
  - tobiu
createdAt: '2026-01-07T12:10:01Z'
updatedAt: '2026-01-07T12:20:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8377'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T12:20:07Z'
---
# Create Mermaid Component Wrapper

To facilitate the usage of Mermaid diagrams in Neo.mjs applications, we should create a wrapper component `Neo.component.wrapper.Mermaid`.

**Rationale:**
- **Simplified API:** Developers can use a declarative component with a `value` or `code` config instead of manually interacting with the Main thread addon.
- **Lifecycle Management:** The component will automatically handle mounting, updates, and destruction.
- **Consistency:** Aligns with existing wrappers like `AmChart`.

**Implementation Details:**
- Class: `Neo.component.wrapper.Mermaid`
- Extends: `Neo.component.Base`
- Configs: `value` (reactive) - the mermaid code.
- Logic:
    - On mount, ensure the Mermaid addon is loaded.
    - Render the diagram using the addon.
    - React to `value` changes by re-rendering.
    - Handle windowId propagation.

## Timeline

- 2026-01-07T12:10:01Z @tobiu added the `enhancement` label
- 2026-01-07T12:10:02Z @tobiu added the `feature` label
- 2026-01-07T12:19:53Z @tobiu assigned to @tobiu
- 2026-01-07T12:20:07Z @tobiu closed this issue
- 2026-01-07T13:25:10Z @jonnyamsp referenced in commit `50d1966` - "feat: Create Mermaid wrapper component

Adds Neo.component.wrapper.Mermaid, a declarative wrapper for the Mermaid Main thread addon. This component allows developers to easily embed Mermaid diagrams using a 'value' config, handling lifecycle management and remote rendering automatically.

Closes #8377"

