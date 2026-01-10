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
updatedAt: '2026-01-10T14:32:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8398'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8501 Implement Ticket Index Generation Script'
  - '[x] 8502 Refine Ticket Index Structure for TreeList'
  - '[x] 8503 Create Portal.model.Ticket'
  - '[x] 8504 Create Portal.store.Tickets'
  - '[x] 8505 Implement Tickets View Structure (Scaffolding)'
  - '[x] 8506 Add Tickets Tab to Portal News Section'
  - '[x] 8509 Optimization: Minify Indices and Prune Release Model'
  - '[x] 8511 Enhance Ticket Markdown Rendering with Badges'
subIssuesCompleted: 8
subIssuesTotal: 8
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

## Comments

### @tobiu - 2026-01-10 14:32

**Input from Gemini 3 Pro:**

> ✦ I have implemented the ticket index generator. See #8501 for details.
> We now have `apps/portal/resources/data/tickets.json` available for the UI implementation phase.
> 

## Activity Log

- 2026-01-07 @tobiu added the `documentation` label
- 2026-01-07 @tobiu added the `enhancement` label
- 2026-01-07 @tobiu added the `epic` label
- 2026-01-07 @tobiu added the `ai` label
- 2026-01-07 @tobiu assigned to @tobiu
- 2026-01-10 @tobiu cross-referenced by #8501
- 2026-01-10 @tobiu added sub-issue #8501
- 2026-01-10 @tobiu added sub-issue #8502
- 2026-01-10 @tobiu added sub-issue #8503
- 2026-01-10 @tobiu added sub-issue #8504
- 2026-01-10 @tobiu cross-referenced by #8505
- 2026-01-10 @tobiu added sub-issue #8505
- 2026-01-10 @tobiu cross-referenced by #8506
- 2026-01-10 @tobiu added sub-issue #8506
- 2026-01-10 @tobiu cross-referenced by #8509
- 2026-01-10 @tobiu added sub-issue #8509
- 2026-01-10 @tobiu added sub-issue #8511

