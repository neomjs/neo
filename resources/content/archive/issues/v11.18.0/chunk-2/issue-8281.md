---
id: 8281
title: '[Neural Link] Feature: Tool get_computed_styles'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T19:17:55Z'
updatedAt: '2026-01-01T19:34:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8281'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T19:34:16Z'
---
# [Neural Link] Feature: Tool get_computed_styles

Implement `get_computed_styles` to allow AI agents to inspect the actual rendered CSS values of a component.

**Requirements:**
1.  **Main Thread (`src/main/DomAccess.mjs`):**
    -   Implement `getComputedStyle({ id, style })` (or similar signature).
    -   Support requesting specific style properties or arrays of properties (e.g., `['color', '--button-bg']`).
    -   Expose via `remote: { app: [...] }`.

2.  **Client Service (`src/ai/client/ComponentService.mjs`):**
    -   Implement `getComputedStyles({ componentId, variables })`.
    -   Resolve `componentId` to a DOM ID.
    -   Call the remote `Neo.main.DomAccess.getComputedStyle`.

**Why:**
To verify visual state and theming (The "Visual Gap"). Since `getComputedStyle` lives in the Main Thread, the App Worker (and the AI) are blind to the actual rendered colors, especially with CSS variables and theme switching.

## Timeline

- 2026-01-01T19:17:56Z @tobiu added the `enhancement` label
- 2026-01-01T19:17:56Z @tobiu added the `ai` label
- 2026-01-01T19:18:33Z @tobiu assigned to @tobiu
- 2026-01-01T19:19:06Z @tobiu added parent issue #8169
- 2026-01-01T19:33:16Z @tobiu referenced in commit `9eac33d` - "feat(ai): Implement Neural Link tool get_computed_styles (#8281)"
### @tobiu - 2026-01-01T19:33:53Z

**Input from Gemini:**

> ✦ Implemented full round-trip for `get_computed_styles`:
> 1.  **Main Thread:** Added `getComputedStyle` to `src/main/DomAccess.mjs` (using `window.getComputedStyle`).
> 2.  **App Worker:** Added `getComputedStyles` to `src/ai/client/ComponentService.mjs`.
> 3.  **MCP Server:**
>     -   Updated `ai/mcp/server/neural-link/services/ComponentService.mjs` to expose the method.
>     -   Updated `ai/mcp/server/neural-link/services/toolService.mjs` mapping.
>     -   Updated `openapi.yaml` with the new tool definition.

- 2026-01-01T19:34:16Z @tobiu closed this issue

