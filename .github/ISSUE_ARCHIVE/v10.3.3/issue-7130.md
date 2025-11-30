---
id: 7130
title: String-Based VDOM Templates
state: CLOSED
labels:
  - enhancement
  - epic
assignees:
  - tobiu
createdAt: '2025-07-30T11:00:58Z'
updatedAt: '2025-08-03T01:09:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7130'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - 7131
  - 7132
  - 7136
  - 7137
  - 7138
  - 7139
  - 7140
  - 7141
  - 7142
  - 7143
  - 7144
  - 7146
  - 7147
  - 7148
  - 7149
  - 7150
  - 7151
  - 7152
  - 7153
  - 7154
  - 7155
  - 7156
  - 7158
  - 7159
  - 7160
  - 7161
  - 7162
  - 7163
subIssuesCompleted: 28
subIssuesTotal: 28
blockedBy: []
blocking: []
closedAt: '2025-08-03T01:09:44Z'
---
# String-Based VDOM Templates

This epic covers the exploration and implementation of a new feature allowing developers to use string-based template literals (HTML-like syntax) to define the VDOM for functional components. This will provide a more familiar and intuitive way to structure component views compared to the current JSON-based VDOM approach.

An early proof-of-concept (PoC) already exists in the following files:
- `test/siesta/tests/functional/HtmlTemplateComponent.mjs`
- `src/functional/component/Base.mjs` (see `enableHtmlTemplates_` config)
- `src/functional/util/html.mjs`

## Comments

### @tobiu - 2025-08-03 01:09

resolved via v10.3.0

## Activity Log

- 2025-07-30 @tobiu assigned to @tobiu
- 2025-07-30 @tobiu added the `enhancement` label
- 2025-07-30 @tobiu added the `epic` label
- 2025-07-30 @tobiu added sub-issue #7131
- 2025-07-30 @tobiu added sub-issue #7132
- 2025-07-30 @tobiu referenced in commit `a3bbca7` - "String-Based VDOM Templates #7130 early stage PoC"
- 2025-07-30 @tobiu referenced in commit `284497b` - "#7130 WIP"
- 2025-07-31 @tobiu added sub-issue #7136
- 2025-07-31 @tobiu added sub-issue #7137
- 2025-07-31 @tobiu added sub-issue #7138
- 2025-07-31 @tobiu added sub-issue #7139
- 2025-07-31 @tobiu referenced in commit `9f58f44` - "String-Based VDOM Templates #7130 => adding the epic md file into the repo, while in development"
- 2025-07-31 @tobiu added sub-issue #7140
- 2025-07-31 @tobiu added sub-issue #7141
- 2025-07-31 @tobiu added sub-issue #7142
- 2025-07-31 @tobiu added sub-issue #7143
- 2025-07-31 @tobiu added sub-issue #7144
- 2025-07-31 @tobiu referenced in commit `c27cf88` - "#7130 WIP"
- 2025-07-31 @tobiu referenced in commit `f2d091e` - "#7130 regex enhancement for storing non-lowercase attributes => config names"
- 2025-07-31 @tobiu referenced in commit `8247da6` - "#7130 resolving all tests inside test/siesta/tests/functional/HtmlTemplateComponent.mjs"
- 2025-07-31 @tobiu referenced in commit `f06c076` - "#7130 guide and epic md file update"
- 2025-07-31 @tobiu referenced in commit `b1648ad` - "#7130 guide update"
- 2025-07-31 @tobiu added sub-issue #7146
- 2025-07-31 @tobiu added sub-issue #7147
- 2025-07-31 @tobiu referenced in commit `b60c0e2` - "#7130 updated learning content for clarity (mounted vs rendered)"
- 2025-07-31 @tobiu added sub-issue #7148
- 2025-07-31 @tobiu added sub-issue #7149
- 2025-07-31 @tobiu referenced in commit `df2dfee` - "#7130 splitting HtmlTemplateProcessor into /HtmlTemplateProcessorLogic.mjs for supporting client-side & builds (WIP)"
- 2025-07-31 @tobiu referenced in commit `a16d33f` - "#7130 WIP - not fully stable yet"
- 2025-07-31 @tobiu referenced in commit `bbd71b2` - "#7130 test adjustments for the rendering refactoring"
- 2025-08-01 @tobiu referenced in commit `e79ab5e` - "#7130 fixed the unit tests regression"
- 2025-08-01 @tobiu added sub-issue #7150
- 2025-08-01 @tobiu added sub-issue #7151
- 2025-08-01 @tobiu added sub-issue #7152
- 2025-08-01 @tobiu referenced in commit `2b1eb64` - "#7130 processVdomForComponents() => simplification"
- 2025-08-01 @tobiu added sub-issue #7153
- 2025-08-01 @tobiu added sub-issue #7154
- 2025-08-01 @tobiu added sub-issue #7155
- 2025-08-01 @tobiu added sub-issue #7156
- 2025-08-01 @tobiu referenced in commit `47b3b0e` - "#7130 functional.component.Base: only import template conversion logic for the dev mode"
- 2025-08-01 @tobiu referenced in commit `d103789` - "#7130 epic update"
- 2025-08-01 @tobiu referenced in commit `9f04ced` - "#7130 functional.component.Base: devmode check fix"
- 2025-08-01 @tobiu referenced in commit `4901a6d` - "#7130 removed a now obsolete file"
- 2025-08-01 @tobiu referenced in commit `74bc55f` - "#7130 functional.util.HtmlTemplateProcessor: docs formatting"
- 2025-08-01 @tobiu referenced in commit `16b31b7` - "#7130 functional.util.HtmlTemplateProcessor: cleanup"
- 2025-08-01 @tobiu referenced in commit `1abb26f` - "#7130 functional.util.HtmlTemplateProcessor: cleanup"
- 2025-08-02 @tobiu added sub-issue #7158
- 2025-08-02 @tobiu added sub-issue #7159
- 2025-08-02 @tobiu added sub-issue #7160
- 2025-08-02 @tobiu added sub-issue #7161

