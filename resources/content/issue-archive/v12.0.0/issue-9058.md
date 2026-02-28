---
id: 9058
title: 'Feat: DevRank Location Normalizer & Data Enrichment'
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-08T21:02:40Z'
updatedAt: '2026-02-08T21:11:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9058'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T21:11:35Z'
---
# Feat: DevRank Location Normalizer & Data Enrichment

To improve the filtering capabilities of the DevRank grid, we need to normalize the location data from GitHub. GitHub's location field is free-text and inconsistent (e.g., "Munich", "München", "Bavaria, DE").

This task involves:
1.  **Creating `DevRank.services.LocationNormalizer`**: A new singleton service that maps raw location strings to ISO 3166-1 Alpha-2 country codes (e.g., "DE", "US") using `Intl.DisplayNames`, a regex dictionary for common variations, and a city mapping. It should also provide a flag emoji lookup.
2.  ** integrating into `DevRank.services.Updater`**: Update the `fetchUserData` method to use the `LocationNormalizer`. The user data object should now include:
    -   `country_code`: The normalized ISO code (for filtering).
    -   `country_flag`: The emoji flag (for UI display).
    -   `location`: The original raw text (preserved for display).

This enables robust "Sovereign Tech" filtering (e.g., "Top Developers in Germany").

## Timeline

- 2026-02-08T21:02:41Z @tobiu added the `enhancement` label
- 2026-02-08T21:02:41Z @tobiu added the `ai` label
- 2026-02-08T21:02:41Z @tobiu added the `feature` label
- 2026-02-08T21:02:54Z @tobiu assigned to @tobiu
- 2026-02-08T21:03:01Z @tobiu added parent issue #8930
- 2026-02-08T21:10:16Z @tobiu referenced in commit `0ffa638` - "feat: DevRank Location Normalizer & Data Enrichment (#9058)"
### @tobiu - 2026-02-08T21:11:27Z

**Input from Gemini 3 Pro:**

> ✦ **Implementation Note: Flag Data Strategy**
> 
> We have explicitly decided **NOT** to store a `country_flag` field (neither emoji nor URL) in the backend `users.json` dataset.
> 
> **Reasoning:**
> 1.  **Payload Optimization:** The `users.json` file is fetched by the client. Minimizing its size is critical. Storing a 2-character ISO `country_code` is significantly more efficient than storing full URLs or base64 strings for every user.
> 2.  **Client-Side Rendering:** The frontend component `Neo.component.CountryFlag` is already capable of resolving the correct flag asset based purely on the `country_code` / `location` value.
> 3.  **Data Hygiene:** Separating data (ISO code) from presentation (Flag asset) adheres to better architectural principles.

- 2026-02-08T21:11:36Z @tobiu closed this issue

