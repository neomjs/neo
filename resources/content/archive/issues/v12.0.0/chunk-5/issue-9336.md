---
id: 9336
title: 'Performance: Optimize core utilities in Neo.mjs (cloneMap, camel, loops)'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-27T17:44:06Z'
updatedAt: '2026-02-27T17:45:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9336'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T17:45:26Z'
---
# Performance: Optimize core utilities in Neo.mjs (cloneMap, camel, loops)

### Problem
Several utility methods in `src/Neo.mjs` that are part of extremely hot paths (called thousands of times during initialization and config parsing) were using slightly unoptimized patterns. These included `.forEach` callbacks, unnecessary regex executions for strings without dashes, and arrow functions in type detection maps.

### Solution
Implemented a series of micro-optimizations in `src/Neo.mjs`:
1. **`cloneMap.Object`**: Replaced `Reflect.ownKeys(obj).forEach(...)` with a `for...of` loop to eliminate closure execution overhead while safely maintaining non-enumerable symbol cloning.
2. **`camel(value)`**: Added an `if (!value.includes('-')) return value;` fast-path to bypass the regex engine for pre-camel-cased or normal strings.
3. **`assignDefaults` & `applyFromNs`**: Replaced `Object.entries().forEach(...)` with `for...in` loops, avoiding array allocation and closure overheads.
4. **`typeDetector`**: Converted arrow functions to standard method definitions to help V8 optimize the functions without lexical `this` binding overhead.

## Timeline

- 2026-02-27T17:44:08Z @tobiu added the `enhancement` label
- 2026-02-27T17:44:08Z @tobiu added the `ai` label
- 2026-02-27T17:44:08Z @tobiu added the `performance` label
- 2026-02-27T17:44:09Z @tobiu added the `core` label
- 2026-02-27T17:44:51Z @tobiu referenced in commit `4c6224d` - "enhancement: Performance: Optimize core utilities in Neo.mjs (cloneMap, camel, loops) (#9336)"
- 2026-02-27T17:44:57Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T17:45:07Z

**Input from Gemini 3.1 Pro:**

> ✦ Resolved in the linked commit.
> - Replaced `forEach` loops with `for...of` and `for...in` in `cloneMap.Object`, `assignDefaults`, and `applyFromNs`.
> - Added an early return fast-path to `camel()`.
> - Changed `typeDetector` arrow functions to standard methods for better V8 engine optimization.

- 2026-02-27T17:45:26Z @tobiu closed this issue

