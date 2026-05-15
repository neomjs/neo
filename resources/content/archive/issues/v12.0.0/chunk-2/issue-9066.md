---
id: 9066
title: 'Bug: Store Sorting inconsistencies with Turbo Mode (Lazy Records)'
state: CLOSED
labels:
  - bug
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T00:36:09Z'
updatedAt: '2026-02-09T01:26:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9066'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T01:26:40Z'
---
# Bug: Store Sorting inconsistencies with Turbo Mode (Lazy Records)

Investigate and fix sorting behavior in `Neo.data.Store` when "Turbo Mode" (`autoInitRecords: false`) is active.

**Symptom:**
In DevRank, toggling the "Commits Only" checkbox triggers a sort on a different field (`total_commits` vs `total_contributions`). The user observed that "only the mounted row-range gets resorted".

**Hypothesis:**
When `autoInitRecords` is false, the Store holds a mix of `Neo.data.Model` instances (for accessed records) and raw JSON objects (for unaccessed records).
If the Sorter uses a property that exists on the Model (e.g. a calculated field like `total_commits`) but *not* on the raw JSON, the sort logic might fail or produce inconsistent results for the uninitialized records.

**Task:**
1.  Analyze `Neo.data.Store.doSort` and `Neo.collection.Sorter`.
2.  Determine if the Sorter correctly handles raw vs. record data.
3.  Implement a fix:
    -   Option A: Force initialization of all records before sorting (heavy).
    -   Option B: Ensure the Sorter can read/calculate fields from raw data (preferred for performance).
4.  Verify fix in DevRank grid.

## Timeline

- 2026-02-09T00:36:09Z @tobiu assigned to @tobiu
- 2026-02-09T00:36:10Z @tobiu added the `bug` label
- 2026-02-09T00:36:11Z @tobiu added the `core` label
- 2026-02-09T00:45:22Z @tobiu cross-referenced by #9064
### @tobiu - 2026-02-09T01:14:12Z

**Input from Gemini 3 Pro:**

> ✦ ### Architectural Decision: "Soft Hydration" for Turbo Mode Sorting
> 
> We analyzed the trade-off between **Full Record Instantiation** and **Lazy Property Injection** ("Soft Hydration") for sorting in Turbo Mode (`autoInitRecords: false`).
> 
> **The Problem:**
> `Neo.collection.Base#doSort` uses direct property access (`item[prop]`). In Turbo Mode, items are raw JSON. If sorting by a Model-only field (calculated or mapped), the sort fails because the property doesn't exist on the raw object.
> 
> **The Solution:**
> We will implement "Soft Hydration" in `Neo.data.Store#doSort`.
> Before sorting, the Store will ensure that the sort field exists on the raw item. If missing, it will calculate/resolve the value using the Model definition and **cache it** on the raw object.
> 
> **Why this wins:**
> 1.  **Memory:** Raw objects + a few cached properties are significantly lighter than 100k full Class instances. Full instantiation hits a browser memory wall for large datasets.
> 2.  **Latency:** Full instantiation causes a massive initial UI freeze. Soft Hydration is "pay-as-you-go" and amortizes the cost.
> 3.  **Caching:** By writing the resolved value back to the raw object, subsequent sorts on the same field become O(1) lookups, matching the performance of instantiated records.
> 
> **Implementation Plan:**
> 1.  Override `doSort` in `Neo.data.Store`.
> 2.  Iterate items and check for the sort property.
> 3.  If missing, invoke a helper (e.g., `RecordFactory.resolveValue`) to compute and assign it.
> 4.  Proceed with standard `Collection` sort.

### @tobiu - 2026-02-09T01:26:22Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **"Soft Hydration"** strategy to fix sorting in Turbo Mode (`autoInitRecords: false`).
> 
> **Core Changes:**
> 1.  **`Neo.data.Store#doSort` Override:** When sorting in Turbo Mode, the store now iterates the raw items and "soft hydrates" them by resolving the sort property (using Model logic) and caching it directly on the raw object. This ensures subsequent sorts are O(1).
> 2.  **`Neo.data.Store#resolveField`:** Added a helper to resolve fields (Mapping, Calculate, Convert) from raw data.
> 3.  **Model Hardening:** Updated `Contributor.mjs` `total_commits` calculation to be "Turbo-Safe". It now polymorphically checks for either the canonical name (`commits_array`) OR the raw key (`cy`), ensuring it works in both Record and Raw contexts.
> 
> **Documentation:**
> Added comprehensive JSDoc to `resolveField` and the Model explaining the "Soft Hydration" architecture and its limitations (recursive dependencies must be handled manually in the model).
> 
> **Result:**
> Sorting by "Commits Only" (which uses the calculated `total_commits` field) now works correctly even when records are not instantiated, preserving the performance benefits of Turbo Mode.

- 2026-02-09T01:26:40Z @tobiu closed this issue
- 2026-02-09T01:29:15Z @tobiu referenced in commit `98c018e` - "Docs: Document 'resolveField' limitations and Turbo-Safe requirements (#9066)"
- 2026-02-09T01:55:51Z @tobiu referenced in commit `0cae8b9` - "Feat: Optimize Store Turbo Mode with 'hasComplexFields' metadata & Fix Filtering (#9066)"
- 2026-02-09T01:58:32Z @tobiu referenced in commit `2fc205c` - "Docs: Update Contributor model JSDoc for Turbo Mode compatibility (#9066)"

