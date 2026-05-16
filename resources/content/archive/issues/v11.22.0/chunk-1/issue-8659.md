---
id: 8659
title: 'Docs: Correct Mermaid Diagram in Neural Timeline Guide'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T23:54:48Z'
updatedAt: '2026-01-14T23:58:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8659'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T23:56:49Z'
---
# Docs: Correct Mermaid Diagram in Neural Timeline Guide

We need to correct the Mermaid diagram in `learn/guides/advanced/NeuralTimeline.md`.

**Issue:** The previous diagram presented "Data Store" and "Coordinator" as separate participants without context, potentially misleading readers into thinking they exist in different realms.

**Fix:** Use Mermaid's `box` feature to explicitly group participants by their Thread/Realm (Main Thread, App Worker, Shared Worker). This clarifies that Store and Coordinator share the App Worker scope.

**Corrected Diagram:**
```mermaid
sequenceDiagram
    participant D as DOM (Main Thread)

    box rgb(240, 255, 240) App Worker
        participant S as Data Store
        participant C as Coordinator
    end

    participant W as Canvas Worker (Shared)

    S->>C: store.on('load')
    C->>C: Extract IDs
    C->>D: waitForDomRect([ids])
    D-->>C: [DOMRects]
    C->>C: Translate Coords
    C->>W: updateGraphData({nodes})

    rect rgb(240, 240, 255)
        loop 60fps Loop
            W->>W: Physics & Draw
        end
    end

    Note over D,C: On Resize
    D->>C: ResizeObserver
    C->>D: Re-measure
    C->>W: updateGraphData
```


## Timeline

- 2026-01-14T23:54:50Z @tobiu added the `documentation` label
- 2026-01-14T23:54:50Z @tobiu added the `ai` label
- 2026-01-14T23:56:25Z @tobiu referenced in commit `62fa141` - "docs: Fix Neural Timeline diagram participant grouping (#8659)"
### @tobiu - 2026-01-14T23:56:27Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the Mermaid diagram in `learn/guides/advanced/NeuralTimeline.md`.
> The new diagram uses `box` syntax to explicitly group "Data Store" and "Coordinator" within the "App Worker" realm, eliminating ambiguity about their topology.

- 2026-01-14T23:56:49Z @tobiu closed this issue
- 2026-01-14T23:58:06Z @tobiu assigned to @tobiu

