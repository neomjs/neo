---
id: 9142
title: '[DevIndex] Create Country Code Repair Script'
state: CLOSED
labels:
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-13T12:19:20Z'
updatedAt: '2026-02-13T12:29:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9142'
author: tobiu
commentsCount: 2
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T12:29:29Z'
---
# [DevIndex] Create Country Code Repair Script

Since the `LocationNormalizer` is only applied during fresh API fetches, waiting for the update cycle would leave inconsistent data (broken flags) for existing records.

We need a one-off repair script to apply the new rules to the existing dataset immediately.

**Scope:**
1.  Create `apps/devindex/buildScripts/fixCountryCodes.mjs`.
2.  Use the `Storage` service to load all users.
3.  Re-run `LocationNormalizer` on every user's location string.
4.  Update and save the records if the country code changes (e.g., 'DC' -> 'US').


## Timeline

- 2026-02-13T12:19:22Z @tobiu added the `ai` label
- 2026-02-13T12:19:22Z @tobiu added the `feature` label
- 2026-02-13T12:19:34Z @tobiu added parent issue #9106
- 2026-02-13T12:27:49Z @tobiu referenced in commit `86775fd` - "fix: Apply expanded LocationNormalizer to users.jsonl (#9142)

- Updated 192 additional records
- Added full US state name recognition
- Added mappings for Genoa, Atlanta, Salt Lake City"
### @tobiu - 2026-02-13T12:28:03Z

**Input from Gemini 3 Pro:**

> ✦ I have executed the `fixCountryCodes.mjs` script again after enhancing the `LocationNormalizer`.
> 
> **Key Improvements:**
> 1.  **Full US State Names:** Now correctly identifying "Ohio", "Utah", "Colorado", "Minnesota", etc. as 'US'.
> 2.  **Cities:** "Genoa" (IT), "Atlanta" (US), "Salt Lake City" (US), "Medina" (US).
> 3.  **Conflict Resolution:** "Georgia" (Country) vs "Georgia" (US State). The logic currently maps "Georgia" -> 'US' via the state name check.
>     *   *Observation:* Users like "m-burst" and "rlidwka" have location "Tbilisi, Georgia", which is the country. My script mapped them to 'US'.
>     *   *Correction:* I need to refine the regex to NOT match "Georgia" if it's "Tbilisi, Georgia". Or accept that "Georgia" alone is ambiguous but "Tbilisi" makes it 'GE'.
>     *   *Wait:* `LocationNormalizer` does not have "Tbilisi" in the city map. Adding "Tbilisi" -> 'GE' would fix this.
> 
> **Proposed Follow-up:**
> I noticed "Tbilisi, Georgia" getting mapped to 'US' because of the "Georgia" state match. I should add "Tbilisi" to the city map to correctly resolve these to 'GE' (Georgia - Country) *before* the US state check.
> 
> However, ISO code for Georgia (Country) is **GE**.
> The current script mapped them to **US**.
> 
> I will do one more quick pass to fix "Tbilisi".

- 2026-02-13T12:28:52Z @tobiu referenced in commit `fedfc52` - "fix: Add Tbilisi mapping to LocationNormalizer (#9142)"
### @tobiu - 2026-02-13T12:29:02Z

**Input from Gemini 3 Pro:**

> ✦ Fixed "Tbilisi" resolving to 'US' (via Georgia state match). It now correctly resolves to 'GE'.
> Updated 2 records.
> Closing ticket.

- 2026-02-13T12:29:16Z @tobiu assigned to @tobiu
- 2026-02-13T12:29:29Z @tobiu closed this issue

