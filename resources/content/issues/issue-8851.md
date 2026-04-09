---
id: 8851
title: 'Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
state: CLOSED
labels:
  - enhancement
  - no auto close
  - ai
  - testing
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-21T14:53:16Z'
updatedAt: '2026-04-08T10:16:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8851'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9782 Neural Link Playwright SDK Integration'
  - '[x] 9783 Implement NeuralLink Playwright Test Fixture'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy:
  - '[ ] 9821 Enhancement: Neural Link VDOM Sync Primitives'
  - '[ ] 9820 R&D: Grid Component Mutability & Column Synchronization'
  - '[ ] 9819 R&D: Identify Ideal Candidates for Whitebox E2E Testing'
blocking: []
closedAt: '2026-04-08T10:16:33Z'
---
# Exploration: Neural Link Driven Playwright Tests (Deep E2E)

## Concept
Move beyond traditional "Black-Box" E2E testing (which only inspects the DOM) to **"White-Box" testing** that can inspect the internal state of the Neo.mjs App Worker directly during a Playwright test run.

By integrating the **Neural Link (NL) SDK** (`ai/services.mjs`) into the Playwright Node.js environment, tests can establish a WebSocket connection to the running application.

## The Architecture
1.  **Playwright (Node.js):** Drives the Browser (User Input, DOM assertions).
2.  **Neural Link Client (Node.js):** Runs *inside the test process*, connected to the App Worker via WebSocket.
3.  **The Loop:**
    *   **Action:** Playwright clicks a button.
    *   **Verification:** Neural Link queries the worker: "What is the store count?", "What is the windowId of this component?".
    *   **Assertion:** Test asserts against the *internal truth* returned by the worker.

## Key Benefits

### 1. Multi-Window Mastery
Testing multi-window apps with Playwright is notoriously flaky due to context switching. With NL, we don't need to switch the Playwright "page" context to inspect a popup. We simply ask the App Worker (which owns all windows) for the state of the component, regardless of where it is rendering.

### 2. State > DOM
Verifying complex data structures (e.g., a Grid with 10k rows) via DOM selectors is slow and brittle. NL allows direct inspection of Stores, Managers, and Component Configs.
*   **Old Way:** `expect(await page.locator('.row').count()).toBe(100)`
*   **New Way:** `expect(await app.getStore('my-store').count).toBe(100)`

### 3. Event Telemetry
We can potentially subscribe to internal framework events (`vnodeInitialized`, `storeLoaded`) to create precise, deterministic wait conditions, eliminating flaky `waitForTimeout` calls.

## Implementation Tasks

1.  **SDK Compatibility:** Verify/Refactor `ai/services.mjs` to ensure it can be imported and instantiated easily within a Node.js Playwright environment (outside the context of a full Agent).
2.  **Test-Specific Handshake:** Implement a mode in the NL Server to accept "Test Clients" that require RPC access but minimal overhead (no full Agent identity/memory).
3.  **Playwright Fixture:** Create a custom test fixture that manages the connection lifecycle.

### Example Usage

```javascript
test('Panel moves to new window correctly', async ({ page, neuralLink }) => {
    // 1. Setup
    const app = await neuralLink.connectToApp('Helix');
    const panelId = 'neo-panel-1';

    // 2. Initial State Check (Internal)
    const initialProps = await app.getComponent(panelId);
    expect(initialProps.windowId).toBe(1);

    // 3. Action (User Input via Playwright)
    await page.click('#detach-button');

    // 4. Verification (Internal via Neural Link)
    // Wait for the worker to acknowledge the move
    await expect.poll(async () => {
        const props = await app.getComponent(panelId);
        return props.windowId;
    }).not.toBe(1);
});
```

## Strategic Value
This capability would uniquely position Neo.mjs as an exceptionally testable framework for complex, multi-window, data-heavy applications—something traditional frameworks struggle to offer.

## Timeline

- 2026-01-21T14:53:18Z @tobiu added the `enhancement` label
- 2026-01-21T14:53:18Z @tobiu added the `ai` label
- 2026-01-21T14:53:18Z @tobiu added the `testing` label
- 2026-01-21T14:53:18Z @tobiu added the `architecture` label
### @tobiu - 2026-01-21T14:57:56Z

> ✦ While standard Neo.mjs unit tests (like RealWorldUpdates.spec.mjs) have some visibility because they run inside the
>   framework's context (single-threaded mode), E2E tests running against a real production build (Worker mode) are typically walled off.
> 
>   Neural Link bridges that wall.
> 
>   By getting write access (set_instance_properties, evaluate_expression), we unlock "God Mode" for E2E testing:
>    1. State Injection: Skip the 10-step wizard setup by injecting the final state directly into the Store/Model.
>    2. Chaos Engineering: Randomly kill a window or disconnect a worker connection to verify recovery logic.
>    3. Hot-Patching during Test: Inject a console.log spy into a specific method on the fly to assert it was called.
> 
>   The topology check is indeed the first handshake. Once we know who is online (App Worker ID), we own the runtime.
> 
>   Issue #8851 serves as the placeholder for this "Next Level" capability. It aligns perfectly with the "Application Engine"
>   narrative—providing professional-grade tooling that toy frameworks can't match.

- 2026-01-26T18:45:10Z @tobiu cross-referenced by #8884
- 2026-04-05T00:24:53Z @tobiu added the `no auto close` label
- 2026-04-05T10:22:32Z @tobiu assigned to @tobiu
- 2026-04-08T09:44:32Z @tobiu added sub-issue #9782
- 2026-04-08T09:44:33Z @tobiu added sub-issue #9783
- 2026-04-08T10:04:39Z @tobiu referenced in commit `108fffc` - "feat: Neural Link Driven Playwright Integration (#8851)

Resolves #8851, #9782, #9783

- Updated Bridge and ConnectionService to track test clients and App Names.

- Created neuralLink test fixture exposing MCP state observation.

- Added end-to-end smoke test validating God Mode access."
### @tobiu - 2026-04-08T10:04:56Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ ### White-Box E2E Testing Implemented
> 
> The implementation for Neural Link Driven Playwright Integration is complete.
> 
> **Changes Included:**
> - Enhanced `Bridge.mjs` to authorize `role=test` connections and updated `ConnectionService.mjs` to cache `appName`.
> - Developed `waitForSession` in `ConnectionService.mjs` to handle Playwright's sequential test sync requirements.
> - Developed `neuralLink` test fixture exposing `app.getComponent`, `app.getStore`, `app.callMethod`, and `app.setProperties`.
> - Addressed robust DOM ID extraction inside the smoke test to support dynamic App Worker context bindings.
> 
> **Verification:**
> Fully verified with a new E2E smoke test (`test/playwright/e2e/NeuralLink.spec.mjs`), which successfully intercepts internal component state (`neo-viewport-1` or dynamic ID) from worker memory seamlessly via websocket, modifies it natively with `setProperties`, and confirms the DOM mutates via `toHaveCSS()`. All without interacting directly with Playwright page handles!
> 
> Changes have been pushed to `feature/issue-8851-neural-link-playwright`.

- 2026-04-08T10:13:00Z @tobiu cross-referenced by PR #9788
- 2026-04-08T10:16:33Z @tobiu referenced in commit `dc50d2d` - "Merge pull request #9788 from neomjs/feature/issue-8851-neural-link-playwright

feat: Neural Link Driven Playwright Integration (#8851)"
- 2026-04-08T10:16:34Z @tobiu closed this issue
- 2026-04-09T11:34:01Z @tobiu marked this issue as being blocked by #9819
- 2026-04-09T11:34:02Z @tobiu marked this issue as being blocked by #9820
- 2026-04-09T11:34:03Z @tobiu marked this issue as being blocked by #9821
- 2026-04-09T11:35:07Z @tobiu referenced in commit `38fd22e` - "test(playwright): stabilize Neural Link test environment and fix DevIndex bindings (#8851)"
- 2026-04-09T12:18:25Z @tobiu cross-referenced by PR #9823
- 2026-04-09T12:20:11Z @tobiu referenced in commit `383d838` - "Merge pull request #9823 from neomjs/feature/issue-8851-neural-link-playwright

Feature: Stabilize Neural Link Grid Tests & E2E Bindings (#8851)"

