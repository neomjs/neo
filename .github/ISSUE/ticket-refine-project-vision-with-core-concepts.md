---
title: 'Refine Project VISION.md with Core Architectural Concepts'
labels: documentation
---

GH ticket id: #7431

**Epic:** Enhance Development Workflow with a Planning Phase
**Assignee:** tobiu
**Status:** Done

## Description

This ticket documents the final, surgical refinements made to the `VISION.md` file. Following the initial update, this effort integrated the core technical differentiators of Neo.mjs directly into the vision's three pillars to provide a stronger architectural foundation for the strategic narrative.

The key refinements include:

1.  **Pillar 1 (Performance):** Clarified that the "Off-the-Main-Thread" (OMT) architecture is enabled by a VDOM specifically designed as a **cross-thread communication protocol**.
2.  **Pillar 2 (Simplicity):** Expanded on the **Unified Config System** to highlight that it applies to *all* classes (not just components), thus avoiding the "component-ize everything" trap common in other frameworks.
3.  **Pillar 3 (AI Partnership):** Articulated that the framework's architecture is inherently AI-native due to its use of a **JSON Blueprint** instead of JSX, making the application's structure natively understandable to LLMs.
