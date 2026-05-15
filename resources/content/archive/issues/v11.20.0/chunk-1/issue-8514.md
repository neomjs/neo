---
id: 8514
title: Refactor createLabelIndex.mjs to use Commander and enhance JSDoc
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-10T18:27:45Z'
updatedAt: '2026-01-10T18:41:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8514'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T18:41:39Z'
---
# Refactor createLabelIndex.mjs to use Commander and enhance JSDoc

To improve consistency and maintainability of our build scripts, `buildScripts/createLabelIndex.mjs` needs to be refactored to match the pattern used in `buildScripts/createReleaseIndex.mjs`.

**Requirements:**
1.  **Commander Integration:** Use the `commander` library for CLI argument parsing.
    *   Support `-o, --output <path>` to specify a custom output file.
2.  **Architecture:**
    *   Export the main logic as a reusable async function `createLabelIndex(options)`.
    *   Include a `runCli()` function for standalone execution.
    *   Use `process.cwd()` based path resolution for consistency.
3.  **Documentation (Knowledge Base Enhancement Strategy):**
    *   Add comprehensive JSDoc to the module and main function.
    *   Include `@summary`, `@module`, and semantic `@keywords` (e.g., `github`, `labels`, `build-script`, `portal`).
    *   Explain the script's purpose: fetching labels from GitHub and generating a JSON index for the Portal.

**Context:**
This script is essential for the "Tickets" view in the Portal (Issue #8398), ensuring that ticket labels are rendered with correct colors and high-contrast text.

## Timeline

- 2026-01-10T18:27:45Z @tobiu added the `documentation` label
- 2026-01-10T18:27:45Z @tobiu added the `ai` label
- 2026-01-10T18:27:46Z @tobiu added the `refactoring` label
### @tobiu - 2026-01-10T18:40:57Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring of `buildScripts/createLabelIndex.mjs`.
> 
> **Changes:**
> 1.  **Architecture:** Converted to a dual-mode module (importable function + standalone CLI) matching `createReleaseIndex.mjs`.
> 2.  **CLI:** Integrated `commander` for robust argument parsing (`-o, --output`).
> 3.  **Documentation:** Applied Knowledge Base Enhancement Strategy with comprehensive JSDoc (`@summary`, `@module`, `@keywords`).
> 4.  **Fix:** Added graceful shutdown of the Neural Link connection to prevent the script from hanging due to the persistent WebSocket.
> 
> **Verified:**
> - Script runs standalone: `node buildScripts/createLabelIndex.mjs`
> - Script exits cleanly (no hang).
> - Output `labels.json` is generated correctly.
> 

- 2026-01-10T18:41:02Z @tobiu referenced in commit `2eaa11a` - "refactor: Enhance createLabelIndex.mjs with Commander, JSDoc and SDK cleanup (#8514)"
- 2026-01-10T18:41:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T18:41:22Z

**Input from Gemini 3 Pro:**

> ✦ Closing ticket as the refactoring is complete and verified.

- 2026-01-10T18:41:39Z @tobiu closed this issue
- 2026-01-10T18:53:15Z @tobiu referenced in commit `677f52e` - "fix: Add explicit process.exit(0) to createLabelIndex CLI runner (#8514)"

