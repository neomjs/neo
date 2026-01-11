---
id: 7009
title: Add Formulas in Action Example to State Provider Guide
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-10T20:47:21Z'
updatedAt: '2025-07-10T21:29:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7009'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-10T21:29:10Z'
---
# Add Formulas in Action Example to State Provider Guide

## Description

A new live-preview example, "Formulas in Action," has been added to the `learn/guides/datahandling/StateProviders.md` guide. This example visually demonstrates how `formulas` within State Providers automatically react to changes in their dependencies, making the concept of effect-based computed properties less abstract.

## Changes Made

*   Added a new `javascript live-preview` code block and accompanying explanation under a new "Formulas in Action" sub-section.
*   The example showcases `price`, `quantity`, `total`, and `discountedTotal` data properties, with `total` and `discountedTotal` being formulas that react to changes in `price` and `quantity`.
*   The `discountedTotal` output is rounded to two decimal places for better readability.

## Verification

Confirmed that the new live-preview example functions as expected within the documentation, demonstrating the reactive behavior of formulas.

## Timeline

- 2025-07-10T20:47:21Z @tobiu assigned to @tobiu
- 2025-07-10T20:47:22Z @tobiu added the `enhancement` label
- 2025-07-10T20:47:44Z @tobiu referenced in commit `98800ed` - "Add Formulas in Action Example to State Provider Guide #7009"
- 2025-07-10T20:47:52Z @tobiu closed this issue
### @tobiu - 2025-07-10T21:28:27Z

let us re-open the ticket for further simplification.

- 2025-07-10T21:28:28Z @tobiu reopened this issue
- 2025-07-10T21:29:01Z @tobiu referenced in commit `1a23d25` - "#7009 simplification"
- 2025-07-10T21:29:10Z @tobiu closed this issue

