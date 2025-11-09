---
id: 7157
title: Update and Refine Getting Started Documentation
state: CLOSED
labels:
  - documentation
  - enhancement
  - developer-experience
assignees:
  - tobiu
createdAt: '2025-08-02T10:16:57Z'
updatedAt: '2025-10-22T22:59:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7157'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T10:17:52Z'
---
# Update and Refine Getting Started Documentation

**Reported by:** @tobiu on 2025-08-02

## Purpose
To enhance the getting started experience for new developers by updating and clarifying the core documentation.

## Changes

### 1. Updated Browser Support Information
- **File**: `.github/GETTING_STARTED.md`
- **File**: `.github/CONCEPT.md`
- **File**: `examples/README.md`
- **Change**: Removed outdated references to "Chromium" and "Safari Tech Preview". The documentation now correctly states that the neo.mjs development mode is fully supported in all major modern browsers (Chrome, Edge, Firefox, Safari).

### 2. Restructured `GETTING_STARTED.md`
- **File**: `.github/GETTING_STARTED.md`
- **Change**: The guide is now split into two distinct paths:
    1.  **Creating an application (Recommended)**: Prioritizes and details the `npx neo-app` command for setting up a workspace.
    2.  **Contributing or Running Examples**: Explains how to fork and clone the main repository, clarifying that this path is for framework contributors or those who want to run the included example apps.
- **Added**: A new section at the end that links to the main `learn/README.md` to guide users toward further learning resources.

### 3. Enhanced `learn/gettingstarted/Setup.md`
- **File**: `learn/gettingstarted/Setup.md`
- **Change**:
    -   Clarified that the `npx neo-app` script starts the development server by default.
    -   Added a new section introducing the "Four Environments" concept, linking directly to the detailed `learn/benefits/FourEnvironments.md` guide. This gives new users early insight into one of Neo.mjs's core architectural advantages.

