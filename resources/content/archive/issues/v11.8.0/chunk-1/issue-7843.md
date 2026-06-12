---
id: 7843
title: '[AI] Implement Runtime Type Safety for AI SDK via OpenAPI Wrappers'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-21T14:14:18Z'
updatedAt: '2025-11-21T14:31:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7843'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T14:31:51Z'
---
# [AI] Implement Runtime Type Safety for AI SDK via OpenAPI Wrappers

**Objective**
Implement a mechanism to ensure runtime type safety for direct SDK service calls (`ai/services.mjs`) without introducing a compilation step.

**Current State**
- MCP tools are type-safe because `toolService.mjs` validates incoming requests against Zod schemas generated from `openapi.yaml`.
- Direct SDK usage (importing services directly) bypasses this validation, creating a "safety gap" where incorrect shapes can be passed to services.

**Proposed Solution**
Refactor the existing validation logic into a shared `OpenApiValidator` utility and use it to create a "Safe SDK" wrapper.

1.  **Extract Validator:** Move the `buildZodSchema` and schema caching logic from `ai/mcp/server/toolService.mjs` into a new `ai/mcp/validation/OpenApiValidator.mjs` module.
2.  **Create Service Wrapper:** Implement a factory function (e.g., `createSafeService`) that:
    -   Accepts a raw service object and the OpenAPI spec.
    -   Iterates over the service methods.
    -   Wraps each method with Zod validation logic derived from the OpenAPI Operation ID.
3.  **Update SDK Export:** Modify `ai/services.mjs` to export these wrapped, validated service instances instead of the raw ones.

**Benefits**
- **DRY:** Single source of truth (OpenAPI) for both MCP and SDK validation.
- **Zero-Build:** Maintains the project's pure ESM / no-compile philosophy.
- **Robustness:** Prevents runtime errors due to invalid arguments when agents use the SDK directly.

**Acceptance Criteria**
- `ai/mcp/validation/OpenApiValidator.mjs` exists and contains the extracted Zod logic.
- `ai/services.mjs` exports validated service instances.
- Passing invalid arguments to an SDK method throws a clear Zod validation error.
- Existing MCP tool functionality remains unchanged (regression test).

## Timeline

- 2025-11-21T14:14:19Z @tobiu added the `enhancement` label
- 2025-11-21T14:14:19Z @tobiu added the `developer-experience` label
- 2025-11-21T14:14:19Z @tobiu added the `ai` label
- 2025-11-21T14:14:19Z @tobiu added the `refactoring` label
- 2025-11-21T14:18:15Z @tobiu assigned to @tobiu
- 2025-11-21T14:31:41Z @tobiu referenced in commit `9cc5337` - "[AI] Implement Runtime Type Safety for AI SDK via OpenAPI Wrappers #7843"
### @tobiu - 2025-11-21T14:31:52Z

<img width="777" height="486" alt="Image" src="https://github.com/user-attachments/assets/71328d8d-46cb-449e-9279-7d8d06060992" />

- 2025-11-21T14:31:52Z @tobiu closed this issue

