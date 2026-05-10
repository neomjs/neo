---
id: 7912
title: 'Fix: Inconsistent and buggy prefixing in IssueSyncer archive paths'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T12:01:36Z'
updatedAt: '2025-11-29T12:08:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7912'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T12:08:45Z'
---
# Fix: Inconsistent and buggy prefixing in IssueSyncer archive paths

The logic for generating archive paths in `IssueSyncer.mjs` (`#getIssuePath`) is inconsistent and prone to "double-prefix" bugs.

1.  **Inconsistency:**
    -   Milestone-based archives use `milestoneArchivePrefix` + title (e.g., `v` + `1.2.3` -> `v1.2.3`).
    -   Release-based archives (for issues without milestones) use `release.tagName` directly. If the tag is `1.2.3` (common in npm), the folder becomes `1.2.3` (no prefix). If the tag is `v1.2.3`, it works, but this relies on the tag format rather than enforcing the config.

2.  **Double-Prefix Bug:**
    -   The current logic unconditionally prepends the prefix: `${prefix}${title}`.
    -   If a milestone is named `v1.2.3`, this results in `vv1.2.3`.

**Tasks:**
1.  **Fix `IssueSyncer.mjs`:** Update `#getIssuePath` to conditionally apply prefixes only if the target string doesn't already start with them. This applies to both milestone titles (using `milestoneArchivePrefix`) and release tags (using `releaseFilenamePrefix`).
2.  **Fix `ReleaseSyncer.mjs`:** Apply the same robust prefix logic to `syncNotes` to prevent `vv1.2.3.md` filenames for release notes.

**Goal:**
Ensure archive folders always have exactly one prefix (e.g., `v1.2.3`), regardless of whether the input was `1.2.3` or `v1.2.3`, and regardless of whether it came from a milestone or a release tag.

## Timeline

- 2025-11-29T12:01:38Z @tobiu added the `bug` label
- 2025-11-29T12:01:38Z @tobiu added the `ai` label
- 2025-11-29T12:08:01Z @tobiu assigned to @tobiu
- 2025-11-29T12:08:22Z @tobiu referenced in commit `3068fd9` - "Fix: Inconsistent and buggy prefixing in IssueSyncer archive paths #7912"
### @tobiu - 2025-11-29T12:08:28Z

**Input from Gemini:**

> ✦ I have refactored the implementation to unify the directory prefixing logic.
> 
> **Changes:**
> 1.  **Unified Config:** Renamed `milestoneArchivePrefix` to `versionDirectoryPrefix` in `config.mjs`. This clearer name reflects that the prefix applies to *all* version-based archive directories, whether derived from a milestone title or a release tag.
> 2.  **Robust Logic (IssueSyncer):** Updated `#getIssuePath` to apply this prefix conditionally. It checks if the source string (milestone title or release tag) already starts with the prefix. If so, it uses it as-is; otherwise, it prepends the prefix. This prevents "double-prefixing" bugs (e.g., `vv1.2.3`).
> 3.  **Robust Logic (ReleaseSyncer):** Applied the same conditional logic to `syncNotes` using `releaseFilenamePrefix`. This ensures release note files are also correctly named (e.g., `v1.2.3.md`) regardless of the input tag format.

- 2025-11-29T12:08:46Z @tobiu closed this issue

