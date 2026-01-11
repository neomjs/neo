---
id: 8190
title: 'Feat: Neural Link - Runtime Code Hot-Patching'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T21:26:17Z'
updatedAt: '2026-01-04T12:49:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8190'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T12:49:58Z'
---
# Feat: Neural Link - Runtime Code Hot-Patching

**Context:**
To support true "Self-Healing" capabilities, agents need a mechanism to apply fixes to the running application without a full reload cycle.

**Scope:**

1.  **Enhance `RuntimeService`:**
    -   Add `patchCode(sessionId, className, methodName, source)`.
    -   Implementation:
        -   Send command to App Worker.
        -   Locate class via `Neo.ns(className)`.
        -   Apply new method: `prototype[methodName] = eval(...)`.
    -   **Security:** This feature MUST be gated behind a `Neo.config.enableHotPatching` flag (default false).

2.  **Tools:**
    -   `patch_code`: Applies the fix.

**Goal:** Enable sub-second self-healing loops for rapid iteration.

## Timeline

- 2025-12-28T21:26:18Z @tobiu added the `enhancement` label
- 2025-12-28T21:26:18Z @tobiu added the `ai` label
- 2025-12-28T21:26:18Z @tobiu added the `architecture` label
- 2025-12-28T21:26:24Z @tobiu added parent issue #8169
- 2026-01-01T22:44:40Z @tobiu assigned to @tobiu
- 2026-01-04T12:48:36Z @tobiu referenced in commit `5394db6` - "feat(ai): Implement Runtime Code Hot-Patching (#8190)

- Add RuntimeService.patchCode (client-side) using new Function for secure scope isolation.
- Register patch_code tool in Neo.ai.Client.
- Expose patch_code via Neural Link MCP Server (RuntimeService proxy).
- Define /code/patch endpoint and PatchCodeRequest in OpenAPI schema.
- Feature requires Neo.config.enableHotPatching = true for security."
### @tobiu - 2026-01-04T12:49:30Z

**Input from Gemini 3 pro:**

> ✦ Implemented `patch_code` capability in `RuntimeService`.
> 
> **Key Implementation Details:**
> - **Placement:** The logic resides in `src/ai/client/RuntimeService.mjs` (App Worker) rather than `Neo.worker.App` to maintain separation of concerns.
> - **Security:** 
>     - The feature is strictly gated behind `Neo.config.enableHotPatching === true`.
>     - We used `new Function('return ' + source)()` instead of `eval()` or `new Function(body)`. This ensures that the patched code is created in the **global scope** and cannot accidentally capture local variables from the `patchCode` method (scope isolation).
> - **Protocol:** The tool expects `source` to be a full function expression string (e.g., `function(args) { ... }`).
> - **Audit:** All hot-patch operations are logged to the console with `console.warn`.

- 2026-01-04T12:49:59Z @tobiu closed this issue
- 2026-01-04T12:54:53Z @tobiu cross-referenced by #8309

