---
id: 7159
title: Optimize Build Process with a Pre-emptive Regex Check
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T11:29:33Z'
updatedAt: '2025-08-02T12:00:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7159'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-02T12:00:19Z'
---
# Optimize Build Process with a Pre-emptive Regex Check

#### 1. Summary

Before running the full, expensive AST parsing pipeline on a file, perform a quick regular expression check to see if the file likely contains an `html` template.

#### 2. Rationale

The current process parses every single `.mjs` file with `acorn`, which is computationally expensive. The vast majority of files in the project do not use `html` templates. By adding a quick pre-check, we can skip the entire AST transformation process for most files, significantly speeding up the overall build time.

#### 3. Scope & Implementation Plan

1.  **Define Regex:** Create a simple, fast regex (e.g., `/html\s*`/`) to detect the presence of a tagged template literal.
2.  **Implement Check:** In `buildESModules.mjs`, inside the `minifyFile` function, add a conditional check:
    *   `if (regex.test(content)) { ... }`
3.  **Conditional Processing:** Only if the regex test passes, call the `processFileContent()` function from the new `astTemplateProcessor`. If it fails, the content can be passed directly to the next step (Terser minification).

#### 4. Definition of Done

-   The regex check is implemented in `buildESModules.mjs`.
-   Files that do not contain `html` templates are no longer processed by the `astTemplateProcessor`.
-   Files that *do* contain `html` templates are still transformed correctly.
-   The overall build time is measurably reduced.

## Timeline

- 2025-08-02T11:29:34Z @tobiu assigned to @tobiu
- 2025-08-02T11:29:35Z @tobiu added the `enhancement` label
- 2025-08-02T11:29:35Z @tobiu added parent issue #7130
- 2025-08-02T11:31:49Z @tobiu cross-referenced by #7160
- 2025-08-02T11:59:39Z @tobiu referenced in commit `4945297` - "Optimize Build Process with a Pre-emptive Regex Check #7159"
- 2025-08-02T12:00:19Z @tobiu closed this issue

