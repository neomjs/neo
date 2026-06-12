---
id: 8535
title: Implement Timeline Navigation in Sections List for Tickets
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T01:29:57Z'
updatedAt: '2026-01-11T01:58:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8535'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T01:58:10Z'
---
# Implement Timeline Navigation in Sections List for Tickets

In the Portal App's Ticket view, the right-side "Sections List" currently parses markdown headers (H2/H3), which is not useful for the timeline-based ticket view.
We need to refactor `Portal.view.news.tickets.Component` to populate the Sections List with timeline items (Body, Comments, Events) instead.

- Update `modifyMarkdown` to collect timeline items.
- Update `renderTimeline` to inject `data-record-id` anchors and metadata.
- Ensure the "Description" (ticket body) is the first item.
- Update the `sections` store with the new timeline data.

## Timeline

- 2026-01-11T01:29:57Z @tobiu added the `enhancement` label
- 2026-01-11T01:29:58Z @tobiu added the `ai` label
- 2026-01-11T01:57:43Z @tobiu referenced in commit `71ad416` - "feat: Implement timeline navigation in Sections List (#8535)"
### @tobiu - 2026-01-11T01:57:53Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the timeline navigation in the Sections List for the Ticket view.
> 
> **Summary of Changes:**
> 1.  **Model Update:** Updated `Portal.model.ContentSection` to include `icon` and `image` fields and changed `id` to `String` type to support timeline IDs (e.g., "timeline-0").
> 2.  **Controller Update:** Refactored `Portal.view.news.tickets.MainContainerController.onIntersect` to handle string-based record IDs, fixing synchronization between scrolling and the list selection.
> 3.  **View Updates:**
>     *   **Component.mjs:**
>         *   Restored missing private fields (`#dateTimeFormatHistory`, `#dateTimeFormatToday`).
>         *   Updated `modifyMarkdown` to initialize `timelineData` with the ticket body ("Description").
>         *   Updated `renderTimeline` to populate `timelineData` with comments and events, using specific IDs, icons, and labels (e.g., "Bug (User)" instead of "Label").
>         *   Injected `data-record-id` attributes into the generated HTML for scroll anchoring.
>         *   Updated the `sections` store with the fully populated `timelineData`.
>     *   **SectionsList.mjs:** Updated `createItemContent` to render icons (font-awesome) and images (avatars) alongside text.
> 4.  **Styling:** Updated `SectionsList.scss` to style the new avatars and icons, ensuring correct vertical alignment with the text.
> 
> **Outcome:**
> The right-side "Sections List" now dynamically reflects the structure of the ticket timeline (Description, Comments, Events), providing a much more useful navigation tool than the previous generic header list. Clicking items correctly scrolls to the content, and scrolling updates the list selection.

- 2026-01-11T01:58:10Z @tobiu closed this issue
- 2026-01-11T01:58:30Z @tobiu assigned to @tobiu

