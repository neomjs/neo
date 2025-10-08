---
title: Implement GitHub Action to Prevent Issue Reopening
labels: enhancement
---

GH ticket id: #7414

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 2
**Assignee:** tobiu
**Status:** Do

## Description

To enforce the project policy that GitHub issues, once closed, should not be reopened, this ticket is for implementing a GitHub Actions workflow. This workflow will automatically close any reopened issue and create a new one, providing a clear explanation to the user. This streamlines the issue tracking process and prevents confusion.

## Acceptance Criteria

1.  A new GitHub Actions workflow file, `.github/workflows/prevent-reopen.yml`, is created.
2.  The workflow is triggered on `issues` of type `reopened`.
3.  The workflow automatically closes the reopened issue.
4.  The workflow creates a new issue with the original content, clearly indicating it was reopened.
5.  A comment is added to the original issue, explaining the policy and linking to the new issue.
