---
id: 7078
title: Create Node.js script to standardize and sort module imports
state: OPEN
labels:
  - enhancement
assignees: []
createdAt: '2025-07-17T12:12:04Z'
updatedAt: '2025-10-23T02:44:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7078'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Node.js script to standardize and sort module imports

## Description
 
 The project currently has hundreds of source files, and the order of top-level `import` statements is inconsistent. Manually sorting them is time-consuming and error-prone. A consistent import order improves code readability and maintainability.
 
 This task is to create a Node.js script inside the `/buildScripts` directory to automate the sorting of ES module imports.
 
 ## Requirements
 
 1.  The script should be able to parse `.mjs` files.
 2.  It should read all top-level `import` statements within a file.
 3.  It must sort the imports alphabetically based on their file path (e.g., `'../core/Base.mjs'` comes before `'../manager/Component.mjs'`).
 4.  The script should then overwrite the original file with the newly sorted imports, leaving the rest of the file content unchanged.
 5.  It should be designed to run across the entire `/src` directory or on specific sub-directories.
 
 ## Future Enhancements
 
 -   Integrate the script into a pre-commit hook to automatically format files.
 -   Add the script to a CI/CD pipeline to enforce the standard.

## Timeline

- 2025-07-17T12:12:05Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-16T02:43:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-16T02:43:39Z @github-actions added the `stale` label
- 2025-10-23T02:44:12Z @github-actions removed the `stale` label

