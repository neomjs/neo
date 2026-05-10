---
id: 8575
title: 'Create Guide: Declarative Config Merging & Structural Injection Pattern'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T02:45:29Z'
updatedAt: '2026-01-12T02:51:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8575'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T02:51:49Z'
---
# Create Guide: Declarative Config Merging & Structural Injection Pattern

Create a new comprehensive guide `learn/guides/fundamentals/DeclarativeConfigMerging.md` explaining the "Structural Injection Pattern" and the native `mergeFrom` feature.

**Topics to cover:**
1.  **The Problem:** Challenges with deep inheritance and configuring nested components (the "prop drilling" equivalent in class-based container hierarchies).
2.  **The Solution:** Declarative Config Merging using `mergeFrom`.
3.  **Core Concepts:**
    *   `[isDescriptor]: true` and `merge: 'deep'` (and `clone: 'deep'` for isolation).
    *   The `mergeFrom` symbol.
    *   How `Neo.container.Base` handles recursive injection.
4.  **Examples:**
    *   Basic example: Injecting config into a direct child.
    *   Advanced example: Injecting config into a nested child (Structural Injection Pattern).
    *   Inheritance example: How subclasses override specific config objects without touching the structure.
5.  **Best Practices:**
    *   Separating Structure (`items`) from Configuration (`myConfig_`).
    *   Using `clone: 'deep'` to prevent prototype pollution in shared container definitions.

**Integration:**
Add the new guide to `learn/tree.json` under "Fundamentals & Core Concepts".

## Timeline

- 2026-01-12T02:45:30Z @tobiu added the `documentation` label
- 2026-01-12T02:45:30Z @tobiu added the `enhancement` label
- 2026-01-12T02:45:30Z @tobiu added the `ai` label
- 2026-01-12T02:48:02Z @tobiu referenced in commit `e1ca4be` - "docs: Add guide for Declarative Config Merging & Structural Injection (#8575)"
- 2026-01-12T02:48:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-12T02:48:15Z

**Input from Gemini 3 Pro:**

> ✦ I have created the guide `learn/guides/fundamentals/DeclarativeConfigMerging.md`.
> 
> It covers:
> - The problem of "Configuration Drilling".
> - The solution using `mergeFrom` and Structural Injection.
> - Core concepts: `isDescriptor`, `merge: 'deep'`, `clone: 'deep'`.
> - Code examples for implementation and subclassing.
> - Best practices for avoiding prototype pollution.
> 
> The guide is integrated into `learn/tree.json`.
> 
> Closing as completed.

- 2026-01-12T02:51:22Z @tobiu referenced in commit `13eb383` - "docs: Explain Descriptor Merging in DeclarativeConfigMerging guide (#8575)"
### @tobiu - 2026-01-12T02:51:32Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `DeclarativeConfigMerging.md` guide to include a section on **Overriding Config Descriptors**. This explains the mechanism behind the `clone: 'deep'` fix (where subclass descriptors now merge on top of parent descriptors) and provides context for the example usage.
> 
> Closing as completed.

- 2026-01-12T02:51:49Z @tobiu closed this issue

