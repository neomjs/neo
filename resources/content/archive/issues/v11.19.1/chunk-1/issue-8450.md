---
id: 8450
title: Add validation to Markdown component to reject HTML 404 responses
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T08:37:18Z'
updatedAt: '2026-01-09T08:39:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8450'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T08:39:25Z'
---
# Add validation to Markdown component to reject HTML 404 responses

When fetching markdown files via AJAX, a 404 error often returns a full HTML page.
This causes the Markdown component to render a full DOM tree inside itself, triggering CSP warnings like:
"The Content Security Policy ... was delivered via a <meta> element outside the document's <head>"

Changes:
- Implement `beforeSetValue` in `Neo.component.Markdown`.
- Check if the input value looks like a full HTML document (e.g. starts with `<!DOCTYPE html>` or `<html`).
- If detected, log a console error and prevent the update by returning `oldValue`.


## Timeline

- 2026-01-09T08:37:19Z @tobiu added the `enhancement` label
- 2026-01-09T08:37:19Z @tobiu added the `ai` label
- 2026-01-09T08:38:36Z @tobiu referenced in commit `6bfadbf` - "feat: Add validation to Markdown component to reject HTML 404 responses (#8450)"
- 2026-01-09T08:39:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T08:39:10Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `beforeSetValue` in `Neo.component.Markdown` to intercept values starting with `<!DOCTYPE html>` or `<html`. This prevents the component from rendering 404 error pages as content, which previously caused CSP warnings and rendering artifacts.

- 2026-01-09T08:39:26Z @tobiu closed this issue

