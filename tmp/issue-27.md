---
id: 27
title: Add .npmignore to exclude AI workflow artifacts
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T13:01:08Z'
updatedAt: '2025-12-02T13:02:38Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/27'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T13:02:38Z'
---
# Add .npmignore to exclude AI workflow artifacts

Create an `.npmignore` file to exclude GitHub Workflow MCP server artifacts from the npm package.

This ensures that local issue tracking files (e.g., `.github/ISSUE`, `.github/ISSUE_ARCHIVE`) do not bloat the published package.

**Content:**
```text
# Additional rules, which are solely npm related, to not bloat the package size.
.github/ISSUE
.github/ISSUE_ARCHIVE
.github/RELEASE_NOTES
.github/.sync-metadata.json

# Original content of the .gitignore file
# See http://help.github.com/ignore-files/ for more about ignoring files.

.env

package-lock.json

# dependencies
/node_modules

# IDEs and editors
/.idea
.project
.classpath
*.launch
.settings
.vscode/

#System Files
.DS_Store
Thumbs.db
```

## Activity Log

- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `ed2accf` - "Add .npmignore to exclude AI workflow artifacts #27"
- 2025-12-02 @tobiu closed this issue

