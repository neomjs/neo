---
id: 7229
title: Enhance AI Query Script with Commander and Content Type Filtering
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-22T01:17:19Z'
updatedAt: '2025-09-22T01:27:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7229'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-22T01:27:07Z'
---
# Enhance AI Query Script with Commander and Content Type Filtering

## 1. Overview

The `buildScripts/ai/queryKnowledgeBase.mjs` script is a critical tool for the AI agent's ability to understand the Neo.mjs framework. This ticket covers enhancing the script to be more robust and powerful by refactoring its command-line interface and adding a content-type filtering feature.

## 2. Scope of Work

### 2.1. Refactor to Use `commander`

-   **Task:** Replace the `yargs` dependency and implementation in `buildScripts/ai/queryKnowledgeBase.mjs` with `commander`.
-   **Reason:** This aligns the script with the conventions used in other project build tools (e.g., `buildThemes.mjs`), creating a more consistent development experience.
-   **Implementation:**
    -   Import `Command` from `commander/esm.mjs`.
    -   Set up the program with a name, version, and options.

### 2.2. Implement Content Type Filtering

-   **Task:** Add a new command-line option to filter query results by content type.
-   **Implementation:**
    -   Add a `--type` (alias `-t`) option to the `commander` setup.
    -   The option should accept the following values: `all`, `blog`, `guide`, `src`, `example`.
    -   The default value should be `all`.
    -   After the initial database query, filter the results based on the `source` file path in the metadata before the scoring algorithm is applied.

### 2.3. Update `AGENTS.md` Documentation

-   **Task:** Update the AI agent guidelines to reflect the new functionality.
-   **Implementation:**
    -   In the "The Query Command" section, update the example to show the new `--type` flag.
    -   In the "Query Strategies" section, add examples and guidance on how to use the new flag for more targeted searches.
    -   Specifically mention the strategy of using `-t src` or `-t example` when conceptual guides are insufficient or to find concrete implementation details.

## 3. Acceptance Criteria

-   Running `npm run ai:query` with the new flags works as expected.
-   The script correctly filters results when a `--type` other than `all` is specified.
-   `AGENTS.md` is updated with clear and accurate instructions on using the new feature.
-   The `yargs` dependency is removed from the script.

## Timeline

- 2025-09-22T01:17:19Z @tobiu assigned to @tobiu
- 2025-09-22T01:17:20Z @tobiu added the `enhancement` label
- 2025-09-22T01:22:42Z @tobiu referenced in commit `b5440d4` - "Enhance AI Query Script with Commander and Content Type Filtering #7229"
- 2025-09-22T01:26:57Z @tobiu referenced in commit `f483d5e` - "#7229 listing all types inside the help option"
- 2025-09-22T01:27:08Z @tobiu closed this issue

