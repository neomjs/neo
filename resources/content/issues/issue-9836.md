---
id: 9836
title: 'E2E: Fix Neural Link InteractionService Fixtures and Zod Validation'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-09T20:27:57Z'
updatedAt: '2026-04-09T20:28:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9836'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T20:28:11Z'
---
# E2E: Fix Neural Link InteractionService Fixtures and Zod Validation

### Description
The initial E2E tests for the Neural Link (`ButtonBaseNL.spec.mjs`) encountered failures when simulating user interactions and extracting DOM properties.

### Root Causes
1. **Zod Array Validation:** `OpenApiValidator.mjs` forced all array validations for objects (`type: 'array', items: { type: 'object' }`) to strictly evaluate as `z.array(z.string())`. This caused `simulateEvent` to throw schema mismatch validation errors when sending `Object[]`.
2. **Missing Backend Imports:** `InteractionService` was not properly imported/unwrapped in the test fixtures.
3. **Event Target Instantiation:** `simulateEvent` required appending `__input` to CheckBox targets because a synthetic `click` on a parent `<label>` does not natively toggle the `<input type="checkbox">` state when fired programmatically.

### Resolution
- Fixed `ai/mcp/validation/OpenApiValidator.mjs` to correctly pass through `z.any()` objects for non-string array schemas.
- Synchronized `test/playwright/e2e/ButtonBaseNL.spec.mjs` with the correct test payloads and targets.
- Fixed properties unwrapping in `test/playwright/fixtures.mjs`.

## Timeline

- 2026-04-09T20:27:58Z @tobiu added the `bug` label
- 2026-04-09T20:27:58Z @tobiu added the `ai` label
- 2026-04-09T20:27:59Z @tobiu added the `testing` label
- 2026-04-09T20:28:11Z @tobiu referenced in commit `40ffd40` - "test: Fix Neural Link InteractionService Fixtures and Zod Validation (#9836)"
- 2026-04-09T20:28:11Z @tobiu closed this issue
- 2026-04-09T20:28:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T20:28:25Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Resolved internally and verified with E2E fixture tests.
> - Re-mapped Zod generic array schemas to allow object sequences.
> - Updated ButtonBaseNL simulation E2E tests to cleanly verify Neural Link integration parameters and `__input` target elements for CheckBox models.


