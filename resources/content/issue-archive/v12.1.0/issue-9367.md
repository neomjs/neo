---
id: 9367
title: Fix Helix & Gallery selection models keynav and record resolution
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T12:49:25Z'
updatedAt: '2026-03-07T14:02:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9367'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T14:02:27Z'
---
# Fix Helix & Gallery selection models keynav and record resolution

The `GalleryModel` and `HelixModel` need to correctly resolve records when navigating via keyboard, regardless of whether `useInternalId` is `true` or `false` on the view.

Since `store.get(id)` checks both the standard map and the `internalIdMap` in `O(1)` time, we should remove the expensive fallback iterators (`store.items.find(...)`) inside `onItemClick`, `onNavKeyRow`, and `onNavKeyColumn`.

Additionally, the `HelixModel.mjs` `select()` method contains a fatal bug where it checks `item.id !== itemId` (where `item` is a string), causing it to fail to remove the `neo-selected` CSS class from previously selected items during navigation.

**Fixes:**
1. In `HelixModel` and `GalleryModel`, rely entirely on `store.get()` for O(1) record resolution, removing `store.items.find()`.
2. Fix `HelixModel.mjs` `select()` method to handle strings correctly: change `if (item.id !== itemId)` to `if (item !== itemId)`.

## Timeline

- 2026-03-07T12:49:26Z @tobiu added the `bug` label
- 2026-03-07T12:49:27Z @tobiu added the `ai` label
- 2026-03-07T12:49:48Z @tobiu assigned to @tobiu
- 2026-03-07T13:22:28Z @tobiu referenced in commit `64eaa4f` - "Fix Helix & Gallery selection models keynav and record resolution (#9367)

- Update createItem to use getRecordId instead of hardcoding getKey, respecting useInternalId
- Update onSelect to map the internalId back to the country string to keep the URL hash clean
- Update afterSetCountry to resolve the string value to its internalId to accurately detect external vs internal selection changes, fixing the false-positive 1s animation fireworks"
### @tobiu - 2026-03-07T13:23:15Z

**Input from Gemini 3.1 Pro:**

> ✦ To elaborate on the final fix implemented here:
> 
> The core issue was a mismatch in how `internalId` was used. The base `Helix` and `Gallery` components have `useInternalId: true` by default, meaning selection models use the `internalId` for DOM operations and state. However, the custom app subclasses (`apps/covid/...` and `apps/sharedcovid/...`) overrode `createItem` and forced the DOM nodes to use the country string instead of the `internalId`.
> 
> This caused several cascading failures during KeyNav:
> 1. **Selection Failure**: `HelixModel` tried to select `neo-helix-1__neo-record-123`, which didn't exist in the DOM.
> 2. **False Positives**: The state change pushed the string `'Spain'` to `afterSetCountry`. Because the selection model internally held `'neo-record-123'`, the view thought the change was "external" (e.g., from the combobox).
> 3. **The 1s Delay**: Thinking it was an external change, it forced a re-selection and called `onKeyDownSpace(null)`, triggering the 1000ms "animation fireworks" transition purely by accident on every keystroke.
> 4. **Enter Key Bug**: `expandItem` failed to find the right node to clone because it was looking for the `internalId`.
> 
> **The Fix:**
> - Updated `createItem` in all 4 custom views to respect `getRecordId(record)` instead of hardcoding `getKey()`.
> - Updated `onSelect` in the views to correctly map the `internalId` back to the country string, ensuring the URL hash stays clean and meaningful (`#mainview=helix&country=Spain`).
> - Updated `afterSetCountry` in the views to map the string back to the `internalId` before checking the selection model. This successfully restores the change-detection logic: it now correctly distinguishes between internal view-based navigation (no fireworks) and external combobox/hash changes (fireworks).
> - Added intent-driven documentation to `afterSetCountry` to explain this exact mechanism for future maintainers.

- 2026-03-07T13:40:59Z @tobiu referenced in commit `9a87a04` - "Fix Gallery & Helix selection resilience to seamlessly support useInternalId modes on direct URL hashes (#9367)"
- 2026-03-07T14:02:27Z @tobiu closed this issue

