---
id: 8283
title: '[Neural Link] Feature: inspect_class tiered detail (compact mode)'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-02T00:35:46Z'
updatedAt: '2026-01-04T12:12:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8283'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T12:12:44Z'
---
# [Neural Link] Feature: inspect_class tiered detail (compact mode)

Enhance the `inspect_class` tool to support a `detail` parameter for token-efficient querying.

**Problem:**
Currently, `inspect_class` returns the full class blueprint (inheritance, all configs, all methods), which can consume ~10K tokens. This is expensive for simple discovery tasks (e.g., "Does this class have a `text` config?").

**Solution:**
Add an optional `detail` parameter:
- `compact`: Returns ONLY "Own" configs and methods (defined on this class).
- `standard` (Default): Returns full inheritance (current behavior).

**Implementation:**
- Compare `ctor.config` with `superCtor.config` to identify "Own" configs (new keys or changed values).
- Use `proto.hasOwnProperty` to identify "Own" methods.
- Update `RuntimeService.inspectClass` and `openapi.yaml`.


## Timeline

- 2026-01-02T00:35:47Z @tobiu added the `enhancement` label
- 2026-01-02T00:35:47Z @tobiu added the `ai` label
- 2026-01-02T00:35:47Z @tobiu added the `performance` label
- 2026-01-02T00:36:02Z @tobiu added parent issue #8169
- 2026-01-04T09:45:21Z @tobiu assigned to @tobiu
- 2026-01-04T12:11:31Z @tobiu referenced in commit `2c68522` - "feat(ai): Implement inspect_class tiered detail (compact mode) (#8283)

- Added 'detail' parameter to inspectClass (standard|compact)
- Implemented 'compact' logic to return only own configs and methods
- Updated client, server proxy, and OpenAPI definition"
### @tobiu - 2026-01-04T12:11:43Z

**Input from Gemini 2.5 pro:**

> ✦ Implemented `inspect_class` tiered detail support.
> 
> **Changes:**
> 1.  **Client-Side (`src/ai/client/RuntimeService.mjs`):**
>     *   Added `detail` parameter (`'standard'` | `'compact'`) to `inspectClass`.
>     *   Implemented logic for `'compact'` mode:
>         *   **Configs:** Returns only configs defined or overridden in the target class (compares against superclass).
>         *   **Methods:** Returns only methods defined on the target class prototype (no inheritance traversal).
> 2.  **Server-Side (`ai/mcp/server/neural-link/services/RuntimeService.mjs`):**
>     *   Updated proxy method to pass `detail` parameter.
> 3.  **OpenAPI (`ai/mcp/server/neural-link/openapi.yaml`):**
>     *   Added `detail` parameter to `InspectClassRequest` schema.
> 
> This significantly reduces token usage for class discovery tasks where full inheritance context is not required.

- 2026-01-04T12:12:44Z @tobiu closed this issue

