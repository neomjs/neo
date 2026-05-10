---
id: 9025
title: 'Feat: DevRank Data Enrichment (LinkedIn & Orgs)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T16:34:12Z'
updatedAt: '2026-02-07T16:45:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9025'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T16:45:21Z'
---
# Feat: DevRank Data Enrichment (LinkedIn & Orgs)

Enhance the DevRank `Updater` service to capture additional professional signals from the GitHub GraphQL API.

**Scope:**
- **LinkedIn URL:** Parse `user.websiteUrl` and `user.socialAccounts` to extract LinkedIn profile URLs.
- **Organizations:** Fetch and store the user's public organization memberships (`organizations(first: 10)`).
- **Schema Update:** Add `linkedin_url` (string) and `organizations` (array of objects: `{ name, avatarUrl, login }`) to the `data.json` schema.

## Timeline

- 2026-02-07T16:34:13Z @tobiu added the `enhancement` label
- 2026-02-07T16:34:13Z @tobiu added the `ai` label
- 2026-02-07T16:34:23Z @tobiu added parent issue #8930
- 2026-02-07T16:35:14Z @tobiu assigned to @tobiu
- 2026-02-07T16:45:08Z @tobiu referenced in commit `ddecd5f` - "feat: DevRank Data Enrichment (LinkedIn & Orgs) (#9025)

- Added logic to fetch and parse LinkedIn URLs.
- Implemented Organization fetching using REST API () to support public memberships without  scope."
- 2026-02-07T16:45:22Z @tobiu closed this issue

