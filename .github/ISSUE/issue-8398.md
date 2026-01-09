---
id: 8398
title: Create 'Tickets' Knowledge Base section in Portal (Mirror GitHub Issues)
state: OPEN
labels:
  - documentation
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-01-07T21:26:28Z'
updatedAt: '2026-01-07T21:27:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8398'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create 'Tickets' Knowledge Base section in Portal (Mirror GitHub Issues)

**Goal:** Transform the Portal into a comprehensive "Knowledge Hub" by mirroring selected GitHub tickets as indexable content. This strategy aims to capture long-tail SEO traffic (specific error messages/solutions), provide structured training data for AI, and demonstrate project velocity.

**Strategic Value:** "Own Your Knowledge". By hosting ticket content on `neomjs.com`, we create a coherent internal knowledge graph (Release Notes -> Ticket -> Docs) that is superior to disparate GitHub pages for both Googlebot and LLMs.

**Key Objectives:**

1.  **Data Pipeline (`buildScripts/createTicketIndex.mjs`):**
    *   Parse `.github/ISSUE_ARCHIVE/` to generate a `tickets.json` index.
    *   **Crucial Filter:** Exclude noise. Only index tickets with high-value labels (e.g., `bug`, `feature`, `enhancement`, `documentation`). Exclude `chore`, `task`, `agent-task`.
    *   Structure the index for efficient loading (potentially paginated or grouped by Year/Milestone).

2.  **UI Implementation:**
    *   Add a "Tickets" tab to the `NewsTabContainer` in the Portal.
    *   Reuse the `apps/portal/view/shared/content/` architecture (TreeList + Markdown View) to display the tickets.
    *   **Read-Only Design:** Clearly position this as an archive/knowledge base. Include a prominent "View Discussion on GitHub" link for interaction.

3.  **Content Rendering:**
    *   Leverage recent `Neo.component.Markdown` enhancements (implicit readonly code blocks, automatic ticket linking) to render ticket bodies faithfully.
    *   Ensure ticket references (e.g., `#123`) within these pages link to the *internal* portal ticket page, keeping the user on-domain.

4.  **Integration:**
    *   Add the new section to the Sitemap and `llms.txt` generation scripts.
    *   Update Release Notes generation to optionally prefer internal ticket links over external GitHub links.

## Activity Log

- 2026-01-07 @tobiu added the `documentation` label
- 2026-01-07 @tobiu added the `enhancement` label
- 2026-01-07 @tobiu added the `epic` label
- 2026-01-07 @tobiu added the `ai` label
- 2026-01-07 @tobiu assigned to @tobiu

