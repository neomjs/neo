---
id: 9141
title: '[DevIndex] Fix Washington DC Location Resolution'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T11:58:45Z'
updatedAt: '2026-02-13T12:18:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9141'
author: tobiu
commentsCount: 3
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T12:16:32Z'
---
# [DevIndex] Fix Washington DC Location Resolution

The current `LocationNormalizer` resolves "Washington DC" to "DC", which results in a broken flag image (e.g., `dc.svg`).
We need to map "Washington DC", "Washington", and "DC" to "US" to ensure the United States flag is displayed correctly.


## Timeline

- 2026-02-13T11:58:47Z @tobiu added the `bug` label
- 2026-02-13T11:58:47Z @tobiu added the `ai` label
- 2026-02-13T11:58:55Z @tobiu added parent issue #9106
- 2026-02-13T12:00:09Z @tobiu referenced in commit `5f26f26` - "fix: Map Washington DC variants to US in LocationNormalizer (#9141)"
### @tobiu - 2026-02-13T12:06:35Z

**Input from Gemini 3 Pro:**

> ✦ Expanding the scope of this fix to address additional failing location resolutions identified:
> 
> *   **São Paulo**: Handling special characters.
> *   **Australia**: Missing from country regex (fixing "Canberra, ACT, Australia").
> *   **Cities**: Amsterdam, Gurugram, Brooklyn, The Hague, Whangarei, Lisbon, Bonn, Sammamish, Bend.
> *   **Regions/States**: California, Texas.
> 
> This will prevent incorrect fallbacks to state codes (e.g., WA, OR, NY) which result in broken flag images.

- 2026-02-13T12:15:22Z @tobiu referenced in commit `05f8994` - "fix: Expand LocationNormalizer coverage (#9141)"
### @tobiu - 2026-02-13T12:15:33Z

**Input from Gemini 3 Pro:**

> ✦ I have expanded the `LocationNormalizer` logic to handle additional failing cases:
> 
> **1. US State Code Heuristic**
> Added a word-boundary check for 2-letter US state codes (e.g., "Columbus, OH" -> "US").
> *   **Included:** `OH, WA, OR, RI, NY, NJ, TX, FL, UT, AZ, NM, NV, MN, MI, IL, MO, TN, KY, WV, VA, NC, SC, GA, AL, MS, LA, AR, OK, KS, NE, SD, ND, WY, MT, VT, CT, MA, PA`.
> *   **Excluded:** `CA` (Canada), `DE` (Germany), `IN` (India), `ID` (Indonesia) to avoid major country code collisions.
> *   **Note:** Minor collisions like `IL` (Israel), `GA` (Gabon), `MT` (Malta) are treated as US states in this context due to higher probability in user location strings.
> 
> **2. Expanded City Map**
> Added mappings for:
> *   **US:** Columbus, Charlotte, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Jacksonville, Indianapolis, Brooklyn, Sammamish, Bend, Hope (RI).
> *   **Regions:** Hawaii (US), California (US), Texas (US).
> *   **International:** São Paulo (BR), Amsterdam (NL), The Hague (NL), Gurugram (IN), Whangarei (NZ), Lisbon (PT), Bonn (DE), Copenhagen (DK), Stockholm (SE).
> 
> **3. Country Regex Updates**
> *   Added `Australia` (AU) and `Malta` (MT) to the direct country matchers.
> 
> This should significantly reduce the number of broken flag images caused by unresolvable location strings.

### @tobiu - 2026-02-13T12:16:15Z

**Input from Gemini 3 Pro:**

> ✦ I have verified the changes and expanded the test cases. All requested locations should now resolve correctly. Closing the issue.

- 2026-02-13T12:16:32Z @tobiu closed this issue
- 2026-02-13T12:18:08Z @tobiu assigned to @tobiu

