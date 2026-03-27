---
id: 9541
title: Remove outdated and redundant .github/CONCEPT.md
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-03-24T14:11:26Z'
updatedAt: '2026-03-24T14:12:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9541'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T14:12:27Z'
---
# Remove outdated and redundant .github/CONCEPT.md

### Description
The file `.github/CONCEPT.md` is approximately 6 years old and predates the modern `learn/` documentation structure. It contains outdated information and terminology (e.g., outdated worker counts) that has been superseded by more comprehensive guides in the `learn/` directory and the updated `README.md`.

### Proposed Changes
- Delete the file `.github/CONCEPT.md`.

### Justification
Maintaining legacy "conceptual" documentation alongside modern guides creates "Context Poisoning" for both new users and AI agents. Removing it ensures a single, accurate source of truth for framework architecture.

## Timeline

- 2026-03-24T14:11:27Z @tobiu added the `documentation` label
- 2026-03-24T14:11:28Z @tobiu added the `ai` label
- 2026-03-24T14:11:28Z @tobiu added the `refactoring` label
- 2026-03-24T14:11:44Z @tobiu referenced in commit `f238ad0` - "docs: Remove outdated CONCEPT.md (#9541)"
- 2026-03-24T14:12:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-24T14:12:09Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully removed the outdated and redundant `.github/CONCEPT.md` file. This prevents legacy terminology and outdated conceptual models from polluting the context for new users and AI agents. 
> 
> Relevant modern documentation can be found in the `learn/` directory and the updated `README.md`.
> 
> Changes pushed to `dev`. (#9541)

- 2026-03-24T14:12:28Z @tobiu closed this issue

