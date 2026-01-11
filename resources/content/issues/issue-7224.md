---
id: 7224
title: 'Create Learning Guide: Using data.Store'
state: OPEN
labels:
  - documentation
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-20T12:01:40Z'
updatedAt: '2025-09-20T12:01:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7224'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Learning Guide: Using data.Store

### Problem
The documentation provides detailed guides for `Neo.collection.Base` and `Neo.data.Model` (Records), which are the building blocks of the data layer. However, there is no dedicated guide for `Neo.data.Store`, which is the class that developers will most commonly use to bring these concepts together and connect them to data-aware UI components like Grids and ComboBoxes. This leaves a gap in the learning path from understanding the core data classes to using them in practice.

### Solution
Create a new guide in the `learn/guides/datahandling` section that focuses specifically on `Neo.data.Store`. This guide will act as a bridge, showing how to use Collections and Records together via the Store to manage and display data.

### Content Outline
The guide should cover the following topics:

1.  **Introduction to `data.Store`:**
    *   Explain that `data.Store` extends `collection.Base` and is specialized for managing `Record` instances.
    *   Briefly recap its role as the central piece of the data layer for UI components.

2.  **Creating a Store:**
    *   Show how to define a class that extends `Neo.data.Store`.
    *   Explain the key `static config` properties:
        *   `model`: How to associate a `Neo.data.Model`.
        *   `keyProperty`: Its importance for record lookups.
        *   `data`: Providing inline, local data.

3.  **Loading Remote Data:**
    *   Explain how to use the `url_` config to fetch data from a remote server.
    *   Show an example of the expected JSON response format.
    *   Explain the `autoLoad_` config.

4.  **Connecting Stores to Components:**
    *   Provide a practical example of creating a `Neo.grid.Container` and assigning a `Store` instance to its `store` config.
    *   Show how the grid automatically displays the data.

5.  **The `sourceId` Pattern for Shared Data:**
    *   Explain the problem: filtering a shared store for one component (like a ComboBox) affects another (like a Grid).
    *   Demonstrate the solution:
        *   Create a main, unfiltered "master" store.
        *   Create a second store for a `ComboBox`, configured with `sourceId` pointing to the master store.
        *   Show how filtering the ComboBox's store does not affect the master store or the Grid.

6.  **Interacting with a Store:**
    *   Briefly cover common methods like `add()`, `remove()`, `get()`, and how they work with `Record` instances.
    *   Mention the `recordChange` event and its importance for granular UI updates.

### Acceptance Criteria
-   A new markdown file is created at `learn/guides/datahandling/UsingStores.md`.
-   The guide follows the proposed content outline.
-   The guide includes clear, practical code examples.
-   The new guide is added to the `learn/tree.json` file.

## Timeline

- 2025-09-20T12:01:40Z @tobiu assigned to @tobiu
- 2025-09-20T12:01:41Z @tobiu added the `documentation` label
- 2025-09-20T12:01:42Z @tobiu added the `enhancement` label
- 2025-09-20T12:01:42Z @tobiu added the `no auto close` label

