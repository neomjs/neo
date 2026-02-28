---
id: 9059
title: Optimize & Minify DevRank Data Schema
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T21:36:23Z'
updatedAt: '2026-02-08T22:31:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9059'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T22:31:54Z'
---
# Optimize & Minify DevRank Data Schema

The current `users.json` dataset is ~6MB for ~6k users (~1KB/user). Scaling to 100k users would result in an unmanageable ~100MB payload.

We need to drastically optimize the data structure to reduce file size by ~70% while maintaining functionality.

**Optimization Strategy:**
1.  **Short Keys (Mapping):** Map verbose keys to short codes (e.g., `login` -> `l`, `total_contributions` -> `tc`).
2.  **Avatar IDs:** Store only the integer ID for avatars (User & Orgs), not full URLs.
3.  **Years Array:** Convert the `years` object map to a sequential array starting from `first_year`.
4.  **Org Simplification:** Limit orgs to top 5 and store as a compact tuple `[login, id]`.
5.  **Smart Formatting:** Use a "One-Record-Per-Line" format (valid JSON array, but each object is minified on a single line) to balance compression with git-diffability.

**Tasks:**
- Update `DevRank.model.Contributor` with field mappings and reconstruction logic.
- Update `DevRank.services.Updater` to persist data in this new format.
- Migrate existing `users.json` to the new schema.

## Timeline

- 2026-02-08T21:36:25Z @tobiu added the `enhancement` label
- 2026-02-08T21:36:25Z @tobiu added the `ai` label
- 2026-02-08T21:36:25Z @tobiu added the `performance` label
- 2026-02-08T21:37:37Z @tobiu assigned to @tobiu
- 2026-02-08T21:37:45Z @tobiu added parent issue #8930
- 2026-02-08T21:40:37Z @tobiu referenced in commit `aac1548` - "feat: Optimized & Minified DevRank Data Schema (70% reduction) (#9059)"
### @tobiu - 2026-02-08T21:41:16Z

**Input from Gemini 3 Pro:**

> ✦ **Optimization Success Report**
> 
> The data schema optimization and minification have been successfully applied.
> 
> **Results:**
> -   **File Size:** Reduced from **~6.0 MB** to **1.60 MB**
> -   **Reduction Rate:** **~73%**
> 
> **Key Changes:**
> -   **Structure:** Migrated `users.json` to a "One-Record-Per-Line" format with short keys (e.g., `l` for `login`, `tc` for `total_contributions`).
> -   **Avatars:** Now stored as integer IDs instead of full URLs.
> -   **Years:** Converted from an object map to a sequential array.
> -   **Orgs:** Limited to top 5 and stored as compact tuples.
> 
> This optimization ensures the application remains performant and scalable as we approach the 100k user target.

- 2026-02-08T21:54:41Z @tobiu referenced in commit `7cf96ba` - "fix: DevRank Grid Mapping (login & years) (#9059)"
- 2026-02-08T21:54:41Z @tobiu referenced in commit `bb11b02` - "refactor: Remove redundant 'years' object from Contributor model (#9059)"
### @tobiu - 2026-02-08T21:55:27Z

**Input from Gemini 3 Pro:**

> ✦ **Optimization Update (Grid & Memory)**
> 
> Following the schema minification, we identified and resolved integration issues with the UI:
> 
> 1.  **Grid Mapping Fix:** Updated `DevRank.store.Contributors` to use `keyProperty: 'l'` (matching the minified `login` key). This resolved an issue where grid rows were assigned temporary negative IDs instead of the correct usernames.
> 2.  **Memory Optimization:** Refactored `DevRank.model.Contributor` to remove the redundant `years` object field. The Model now maps the individual year fields (e.g., `y2023`) directly from the raw data array, eliminating the need to construct an intermediate object map in memory.
> 3.  **Data Logic:** Updated the year field calculation logic to robustly handle both raw data and model instance contexts.

- 2026-02-08T22:31:54Z @tobiu closed this issue
- 2026-02-08T22:53:38Z @tobiu referenced in commit `1f357ea` - "fix: Add defaultValue:null to Model & cleanup CountryFlag log (#9059)"
- 2026-02-08T23:00:29Z @tobiu cross-referenced by #9062

