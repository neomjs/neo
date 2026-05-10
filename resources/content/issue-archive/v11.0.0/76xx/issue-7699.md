---
id: 7699
title: 'AI: Strengthen the mandatory pre-response check'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T12:40:26Z'
updatedAt: '2025-11-03T12:42:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7699'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-03T12:42:06Z'
---
# AI: Strengthen the mandatory pre-response check

## Problem

The agent can fail to execute the mandatory session initialization process if the first user prompt is a simple greeting (e.g., "hi").

The agent's conversational model can override its procedural instructions, misinterpreting the greeting as a simple social cue rather than a formal prompt that should trigger the check defined in `.gemini/GEMINI.md`.

## Proposed Solution

To make the check more robust and prevent this failure mode, we will add an explicit note to the `Mandatory Pre-Response Check` section of `.gemini/GEMINI.md`.

This change will clarify that the very first user utterance, regardless of content, must trigger the initialization procedure.

### Change Details

Add the following text to the instruction:

```markdown
**Note:** The very first user utterance after the initial context is loaded, no matter how simple (e.g., 'hi', 'ok'), is considered the first prompt and MUST trigger this check.
```

### Ideal State

As discussed, the ideal solution would be to trigger the startup procedure *before* the user can enter their first prompt. However, assuming this is not currently feasible, the proposed change will make the existing pre-response check rock-solid.


## Timeline

- 2025-11-03T12:40:27Z @tobiu added the `enhancement` label
- 2025-11-03T12:40:27Z @tobiu added the `ai` label
- 2025-11-03T12:41:37Z @tobiu assigned to @tobiu
- 2025-11-03T12:41:58Z @tobiu referenced in commit `906a0c9` - "AI: Strengthen the mandatory pre-response check #7699"
- 2025-11-03T12:42:06Z @tobiu closed this issue

