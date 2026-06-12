---
id: 8562
title: Refactor TimelineCanvas.onTimelineDataLoad to use waitForDomRect
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-11T22:59:02Z'
updatedAt: '2026-01-11T23:27:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8562'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T23:27:07Z'
---
# Refactor TimelineCanvas.onTimelineDataLoad to use waitForDomRect

The current implementation of `onTimelineDataLoad` in `TimelineCanvas.mjs` uses a recursive retry logic with `setTimeout` to wait for DOM elements (ticket avatars/badges) to be available. This mimics the behavior of `waitForDomRect`, but in an ad-hoc, less robust way.

We should refactor this method to be `async` and explicitly use `waitForDomRect` for the target elements. This will simplify the code, leverage the framework's built-in robust waiting mechanism, and ensure consistent behavior.

**Proposed Change:**
1. Make `onTimelineDataLoad` async.
2. Replace the `me.timeout(delay).then(...)` and the retry logic with a call to `me.waitForDomRect({ id: ids, attempts: 20, delay: 50 })`.
3. Handle the case where `waitForDomRect` returns valid rects directly.

**Current Logic:**
```javascript
        // If this is a fresh data load (not a resize), wait a bit for DOM
        let delay = attempt === 0 ? 0 : 50;

        me.timeout(delay).then(async () => {
            // ... fetch rects
            // ... retry if missing
        });
```

**New Logic (Conceptual):**
```javascript
    async onTimelineDataLoad(records, isResize = false) {
        // ... (guards)
        let ids = records.map(r => `${r.id}-target`);
        let rects = await me.waitForDomRect({ id: ids, attempts: 20, delay: 50 });
        // ... (process rects)
    }
```
This change aligns `TimelineCanvas` with the robust pattern used elsewhere (e.g., in `MainContainerController`).

## Timeline

- 2026-01-11T22:59:03Z @tobiu added the `ai` label
- 2026-01-11T22:59:03Z @tobiu added the `refactoring` label
- 2026-01-11T23:26:19Z @tobiu referenced in commit `605635a` - "fix: Prevent race condition in TimelineCanvas by making sections store update optional (#8562, #8563)"
- 2026-01-11T23:26:28Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T23:26:43Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `onTimelineDataLoad` in `TimelineCanvas.mjs` to use `waitForDomRect`.
> 
> **Changes:**
> - Replaced the manual recursive `setTimeout` logic with a single `await this.waitForDomRect({ attempts: 20, delay: 50, id: ids })`.
> - Added a stale data check (`if (me.lastRecords !== records) return`) to prevent race conditions from out-of-order updates.
> - Ensured `timelineRect` is fetched (as a check) but doesn't strictly block execution if items are found, improving robustness.
> - Updated `onResize` to call `onTimelineDataLoad` with the correct arguments (removed the unused `attempt` param).
> 
> This makes the method cleaner, more robust, and fully async.

- 2026-01-11T23:26:51Z @tobiu added parent issue #8398
- 2026-01-11T23:27:07Z @tobiu closed this issue

