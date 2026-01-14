---
id: 8659
title: 'Docs: Correct Mermaid Diagram in Neural Timeline Guide'
state: OPEN
labels:
  - documentation
  - ai
assignees: []
createdAt: '2026-01-14T23:54:48Z'
updatedAt: '2026-01-14T23:54:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8659'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

