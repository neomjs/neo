---
id: 7709
title: Fix race conditions in component rendering and updates
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-06T12:15:52Z'
updatedAt: '2025-11-06T12:18:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7709'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-06T12:18:43Z'
---
# Fix race conditions in component rendering and updates

This ticket addresses two related race conditions that were causing flaky tests in `test/playwright/component/component/Base.spec.mjs`.

### 1. Colliding Parent/Child VDOM Updates

**Problem:** A race condition can occur when a parent and a direct child component receive update requests simultaneously. The collision detection in `VdomLifecycle.mjs#hasUpdateCollision()` failed to identify a conflict when the parent's `updateDepth` and the child's `distance` were both 1. This allowed updates to run in parallel, leading to unpredictable DOM state.

**Solution:** Modify `hasUpdateCollision()` to use `<=` instead of `<`:
```javascript
hasUpdateCollision(updateDepth, distance) {
    return updateDepth === -1 ? true : distance <= updateDepth;
}
```
This ensures a direct child update is correctly queued when its parent is already updating.

### 2. Test Synchronization with Initial Render

**Problem:** The test was starting its updates before the component's asynchronous initialization process was fully complete. `await page.waitForSelector()` is not sufficient to guarantee the component is in a stable, idle state ready for updates. This caused updates to be lost or to conflict with the initial render itself.

**Solution:** Make the test more robust by synchronizing with the application state. Before triggering updates, force the test to wait for the initial state to be rendered in the DOM by reading a property from the relevant elements.

Example change in `test/playwright/component/component/Base.spec.mjs`:
```javascript
await page.waitForSelector('.neo-button');

// Add these checks to wait for the initial render to be fully complete
const initialToolbarHeight = await page.locator(`#${toolbarId}`).evaluate(el => el.style.height);
const initialButtonText    = await page.locator(`#${buttonId}`).evaluate(el => el.firstChild.innerHTML);

expect(initialToolbarHeight).toBe('200px');
expect(initialButtonText).toBe('hello');

// Now it is safe to proceed with updates
await page.evaluate(async ({buttonId, toolbarId}) => {
    // ...
});
```

## Timeline

- 2025-11-06T12:15:53Z @tobiu added the `bug` label
- 2025-11-06T12:15:53Z @tobiu added the `ai` label
- 2025-11-06T12:16:37Z @tobiu assigned to @tobiu
- 2025-11-06T12:18:10Z @tobiu referenced in commit `0483f13` - "Fix race conditions in component rendering and updates #7709"
- 2025-11-06T12:18:43Z @tobiu closed this issue

