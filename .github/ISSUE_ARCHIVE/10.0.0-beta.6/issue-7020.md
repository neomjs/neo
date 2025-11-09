---
id: 7020
title: 'JSDoc Enhancement: Add `@reactive` Tag to All Reactive Configs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-11T16:36:36Z'
updatedAt: '2025-07-11T19:54:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7020'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-11T19:54:33Z'
---
# JSDoc Enhancement: Add `@reactive` Tag to All Reactive Configs

**Reported by:** @tobiu on 2025-07-11

## 1. The Goal (What)

The goal is to programmatically parse the entire `src/` directory and add a `@reactive` JSDoc tag to every reactive configuration property within every class. Non-reactive (prototype-based) configs will be left untagged.

## 2. The Problem (Why)

Currently, the framework uses a convention to distinguish between two types of properties inside the `static config` block:

1.  **Reactive Configs:** The root definition uses a trailing underscore (e.g., `text_`).
2.  **Non-Reactive Configs:** Have no trailing underscore.

This convention, while functional, presents a significant Developer Experience (DX) challenge due to inheritance:

- **Hidden Reactivity:** A subclass can override the default value of a reactive config without using the underscore. For example, `button.Base` can set `text: 'my-default'` to change the value of `component.Base`'s `text_` config. To a developer looking only at `button.Base`, `text` appears to be a standard non-reactive config, when it is, in fact, still reactive.
- **Cognitive Load:** Developers must actively remember the underscore convention and mentally trace the inheritance chain to be certain of a config's behavior.
- **Documentation Ambiguity:** Without an explicit marker, it's difficult for automated tools (like our JSDoc parser) to cleanly separate the two types of configs into distinct groups for clearer documentation.

Adding an explicit `@reactive` tag solves these problems by providing an unambiguous, in-place indicator of a config's behavior, regardless of where it was originally defined.

## 3. The Implementation (How)

This task is too complex for manual or LLM-based file editing due to the need to understand the full class hierarchy. A simple text search for properties ending in `_` is insufficient.

The correct approach is to create a **dedicated build script** (`buildScripts/addReactiveJsdocTags.mjs` or similar) that will:

1.  **Build a Dependency Graph:** Parse all `.mjs` files in `src/` to build a complete class hierarchy map, tracking which class extends which.
2.  **Identify Root Reactive Configs:** For each class, identify all properties in its `static config` that end with a trailing underscore. These are the root definitions.
3.  **Propagate Reactivity:** Traverse the hierarchy tree. For each class, compile a complete list of all reactive configs, including those inherited from its parents and ancestors.
4.  **Tag All Instances:** For every class, iterate through its `static config` properties. If a property name (with or without an underscore) matches an entry in the compiled list of reactive configs for that class, the script will find its preceding JSDoc comment and insert a `@reactive` tag.

This automated approach ensures accuracy and can be re-run as needed to keep the documentation in sync with the code.

## Comments

### @tobiu - 2025-07-11 19:54

reopening for adding examples

