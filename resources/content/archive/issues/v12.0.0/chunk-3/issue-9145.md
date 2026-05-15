---
id: 9145
title: Integrate Heuristics into Updater Pipeline
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T13:42:15Z'
updatedAt: '2026-02-13T13:52:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9145'
author: tobiu
commentsCount: 1
parentIssue: 9143
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T13:52:44Z'
---
# Integrate Heuristics into Updater Pipeline

Update `apps/devindex/services/Updater.mjs` to integrate the new `Heuristics` service.

**Requirements:**
1.  **Import:** Import `Heuristics` from `./Heuristics.mjs`.
2.  **Analyze:** Inside `fetchUserData` (or just before returning the minified object), call `Heuristics.analyze(minifiedUser)`.
3.  **Inject:** Add the resulting heuristics object to the user record under the key `h`.
4.  **Persist:** Ensure `Storage.mjs` writes this new field to `users.jsonl`.

**Example Record:**
```javascript
{
  "l": "tobiu",
  "tc": 7700,
  "h": { "v": 21, "a": 2.5, "c": 5 }
}
```


## Timeline

- 2026-02-13T13:42:16Z @tobiu added the `enhancement` label
- 2026-02-13T13:42:16Z @tobiu added the `ai` label
- 2026-02-13T13:42:26Z @tobiu added parent issue #9143
- 2026-02-13T13:50:50Z @tobiu assigned to @tobiu
- 2026-02-13T13:52:18Z @tobiu referenced in commit `196fcf9` - "feat(devindex): Integrate Heuristics Engine into Updater (#9145)

- Imported Heuristics service
- Applied Heuristics.analyze() to enriched user profiles
- Injected 'h' object (Velocity, Acceleration, Consistency) into users.jsonl records
- This enables 'Cyborg Index' analysis without changing frontend logic yet"
### @tobiu - 2026-02-13T13:52:26Z

**Input from Gemini 3 Pro:**

> ✦ Integrated the `Heuristics` engine into the `Updater` pipeline.
> 
> **Change:**
> -   Updated `apps/devindex/services/Updater.mjs` to call `Heuristics.analyze(minifiedUser)` before saving.
> -   The resulting metrics (Velocity, Acceleration, Consistency) are now injected into the user record as the `h` property.
> 
> **Impact:**
> -   All new updates will automatically include these metrics.
> -   Existing users will be backfilled over time as the `Updater` cycles through them (due to the `lastUpdate` queue).
> -   This data can now be used for downstream analysis or UI visualizations (once the frontend is updated).
> 
> Ready for testing or deployment.

- 2026-02-13T13:52:44Z @tobiu closed this issue

