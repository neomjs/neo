---
id: 9237
title: Process Issue Templates for DevIndex Opt-In
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T23:29:41Z'
updatedAt: '2026-02-21T23:42:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9237'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T23:42:00Z'
---
# Process Issue Templates for DevIndex Opt-In

### Description
Implement the automated pipeline to process the two new issue templates in the `neomjs/devindex-opt-in` repository: "DevIndex Opt-In (Myself)" and "DevIndex Opt-In (Nominate Others)".

### Requirements
1. **Fetch Issues:** Query the GitHub GraphQL API to fetch open issues with the `devindex-opt-in` label.
2. **Differentiate Request Types:** Parse the issue title to determine if it's a "Self" request or an "Others" nomination.
3. **Process "Self" Requests (Identity Verified):**
   - Extract the issue author's username.
   - **Blocklist Reversal:** Since the identity is verified, remove the user from the blocklist if they are on it.
   - Add to `tracker.json` (if not already tracked/indexed).
4. **Process "Nominate Others" Requests (Unverified Identity):**
   - Extract the list of usernames from the issue body.
   - Validate that the usernames exist on GitHub (e.g., via a quick GraphQL `user(login: "...")` check).
   - **NO Blocklist Reversal:** Crucially, do NOT remove these users from the blocklist. A third party cannot override a personal opt-out.
   - Add valid, non-blocklisted users to `tracker.json` (if not already tracked/indexed).
5. **Issue Management:** Add an automated comment to the issue summarizing the actions taken and close the issue.

## Timeline

- 2026-02-21T23:29:42Z @tobiu added the `enhancement` label
- 2026-02-21T23:29:42Z @tobiu added the `ai` label
- 2026-02-21T23:29:47Z @tobiu assigned to @tobiu
- 2026-02-21T23:41:24Z @tobiu referenced in commit `531ea51` - "feat: Process Issue Templates for DevIndex Opt-In (#9237)"
### @tobiu - 2026-02-21T23:41:40Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the logic to process the issue templates for Opt-In requests in the `OptIn.mjs` service.
> 
> 1. **"Self" Requests**: Handled accurately by extracting the author's login, adding them to the tracker, and explicitly removing them from the blocklist.
> 2. **"Nominate Others" Requests**: 
>    - Uses improved regex parsing to extract usernames from the issue body, filtering out markdown list artifacts.
>    - Validates each username against the GitHub REST API (`users/${uname}`).
>    - Appends valid usernames to the tracker without removing them from the blocklist.
>    - Constructs meaningful, dynamic comments that explicitly list which users were successfully added and which failed validation.
> 3. **Closing Actions**: Issues are automatically commented on and closed after processing.
> 
> This feature is now fully operational.

- 2026-02-21T23:42:00Z @tobiu closed this issue
- 2026-02-21T23:47:32Z @tobiu referenced in commit `26878fc` - "feat: Add detailed comment status for DevIndex Opt-In (#9237)"
- 2026-02-21T23:49:29Z @tobiu referenced in commit `58be928` - "feat: Add self-opt-in hint for blocked users (#9237)"

