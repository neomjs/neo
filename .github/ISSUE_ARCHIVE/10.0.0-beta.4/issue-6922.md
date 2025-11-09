---
id: 6922
title: learn/guides => new learning path structure
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-01T11:48:01Z'
updatedAt: '2025-10-22T22:56:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6922'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-01T15:39:32Z'
---
# learn/guides => new learning path structure

**Reported by:** @tobiu on 2025-07-01

The folder contains too many items now, so we need grouping.

   1. Fundamentals & Core Concepts:
       * Application Bootstrap
       * Instance Lifecycle
       * Declarative Component Trees VS Imperative Vdom (Moved up significantly)
       * Config System Deep Dive
       * Extending Neo Classes
       * Main Thread Addons: Interacting with the Browser


   2. UI Building Blocks:
       * Component and Container Basics
       * Layouts
       * Custom Components
       * Working with VDom (Still relevant here for deeper dives, but the high-level concept is covered earlier)


   3. Data Handling:
       * Collections
       * Records
       * Grids
       * Tables (Stores) (Still hidden, but logically grouped)
       * Shared Bindable Data (State Providers) (Moved up, as it's fundamental to reactive data flow)


   4. User Interaction & Advanced Features:
       * User Input (Forms)
       * Form Fields (Specific form field types)
       * Events (Custom Events, DOM Events)


   5. Specific Applications/Features:
       * Multi-Window Applications (Still hidden)
       * Mixins (Still hidden)
       * Portal App (At the very bottom, as discussed)

