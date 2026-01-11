---
id: 7641
title: 'Refactor: Improve `createComment` with icon map and better formatting'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T09:50:27Z'
updatedAt: '2025-10-25T10:10:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7641'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-25T10:10:09Z'
---
# Refactor: Improve `createComment` with icon map and better formatting

Based on a code review, the `createComment` tool will be refactored to improve maintainability and the visual format of the final comment.

**Changes:**
1.  **Icon Map:** An `AGENT_ICONS` constant will be introduced to replace the `if/else` logic, making it easier to add new agents. A default icon will be included.
2.  **Horizontal Rule:** A markdown horizontal rule (`---`) will be added after the comment header for better visual separation.
3.  **Agent Name:** The agent name in the header will be cleaned to use only the first word (e.g., "Gemini" instead of "Gemini 2.5 pro").
4.  **JSDoc:** The JSDoc for the `createComment` method will be updated to be more explicit about the responsibilities of the agent vs. the tool.

## Timeline

- 2025-10-25T09:50:29Z @tobiu added the `enhancement` label
- 2025-10-25T09:50:29Z @tobiu added the `ai` label
- 2025-10-25T10:09:52Z @tobiu referenced in commit `c08245b` - "Refactor: Improve createComment with icon map and better formatting #7641"
- 2025-10-25T10:10:09Z @tobiu closed this issue
- 2025-10-25T10:10:26Z @tobiu assigned to @tobiu

