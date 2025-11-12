---
id: 7745
title: 'Refactor `generate-seo-files.mjs`: Implement CLI Option Parsing with Commander'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-11T12:33:25Z'
updatedAt: '2025-11-11T12:59:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7745'
author: tobiu
commentsCount: 0
parentIssue: 7446
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-11T12:59:39Z'
---
# Refactor `generate-seo-files.mjs`: Implement CLI Option Parsing with Commander

**Reported by:** @tobiu on 2025-11-11

---

**Parent Issue:** #7446 - Enhance SEO for Neo.mjs Website

---

The `buildScripts/generate-seo-files.mjs` script currently parses command-line options manually using `process.argv`. This approach is inconsistent with other build scripts in the project, such as `buildScripts/buildAll.mjs`, which leverage the `commander` library for CLI argument parsing.

This ticket proposes to refactor `buildScripts/generate-seo-files.mjs` to use the `commander` library for handling its command-line options.

**Benefits of using `commander`:**
-   **Consistency:** Aligns with existing project conventions for CLI tools.
-   **Robustness:** Provides built-in argument validation and type checking.
-   **Maintainability:** Reduces boilerplate code for argument parsing.
-   **User Experience:** Automatically generates help messages and handles common CLI patterns.

**Implementation Details:**
-   Replace the manual `process.argv` parsing logic within the `runCli` function with `commander`'s API.
-   Define all existing options (`--format`, `--base-url`, `--base-path`, `--output`, `--no-lastmod`, `--no-top-level`) using `program.option()`.
-   Ensure that the script's functionality remains identical after the refactoring.

**Acceptance Criteria:**
-   `buildScripts/generate-seo-files.mjs` uses `commander` for CLI option parsing.
-   All existing command-line options are supported and function as before.
-   The script's output and behavior are unchanged when invoked with the same arguments.

