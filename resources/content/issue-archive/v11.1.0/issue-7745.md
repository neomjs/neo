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
blockedBy: []
blocking: []
closedAt: '2025-11-11T12:59:39Z'
---
# Refactor `generate-seo-files.mjs`: Implement CLI Option Parsing with Commander

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

## Timeline

- 2025-11-11T12:33:25Z @tobiu assigned to @tobiu
- 2025-11-11T12:33:26Z @tobiu added the `enhancement` label
- 2025-11-11T12:33:26Z @tobiu added the `ai` label
- 2025-11-11T12:33:26Z @tobiu added the `refactoring` label
- 2025-11-11T12:33:49Z @tobiu added parent issue #7446
- 2025-11-11T12:59:21Z @tobiu referenced in commit `450ea66` - "Refactor generate-seo-files.mjs: Implement CLI Option Parsing with Commander #7745"
- 2025-11-11T12:59:39Z @tobiu closed this issue

