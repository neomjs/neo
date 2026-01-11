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
  - '[x] 7131 Dev Mode: Main Thread Addon for Live Parsing'
  - '[x] 7132 Production Mode: Build-Time Parsing with `parse5`'
  - '[x] 7136 Alternative Dev Mode: In-Worker Parsing with `parse5`'
  - '[x] 7137 Template Syntax Specification'
  - '[x] 7138 Parser: Interpolation and Data Type Handling'
  - '[x] 7139 Parser: Component vs. HTML Tag Recognition'
  - '[x] 7140 Bundle `parse5` for Browser Compatibility'
  - '[x] 7141 Enhance Learning Content'
  - '[x] 7142 Expand Test Coverage with Real Components'
  - '[x] 7143 Code Quality Refinement'
  - '[x] 7144 Create a Real-World Example'
  - '[x] 7146 Fix Conditional Rendering and Add Tests'
  - '[x] 7147 Refactor `render` to `initVnode` and `createTemplateVdom` to `render`'
  - '[x] 7148 Create a Robust VDOM-to-String Serializer'
  - '[x] 7149 Refactor Build-Time Parser to be AST-Based for Robustness'
  - '[x] 7150 Build-Time `html` Template to VDOM Conversion'
  - '[x] 7151 Finalize and Integrate AST-based Build Process'
  - '[x] 7152 Showcase Nested Templates and Component Usage'
  - '[x] 7153 Introduce `attributeNameMap` for Robust Attribute Handling'
  - '[x] 7154 Fix Self-Closing Custom Component Tags'
  - '[x] 7155 Fix Build-Time Conditional Template Rendering'
  - '[x] 7156 Finalize Build-Time AST Transformation'
  - '[x] 7158 Create a Reusable, AST-Based Build-Time Processor'
  - '[x] 7159 Optimize Build Process with a Pre-emptive Regex Check'
  - '[x] 7160 Integrate Template Processing into `dist/development` Build'
  - '[x] 7161 Integrate Template Processing into `dist/production` Build'
  - '[x] 7162 Add Error Resilience to AST Processor'
  - '[x] 7163 Create "Under the Hood: HTML Templates" Guide'
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

## Timeline

- 2025-07-30T11:00:58Z @tobiu assigned to @tobiu
- 2025-07-30T11:00:59Z @tobiu added the `enhancement` label
- 2025-07-30T11:00:59Z @tobiu added the `epic` label
- 2025-07-30T11:01:36Z @tobiu added sub-issue #7131
- 2025-07-30T11:02:07Z @tobiu added sub-issue #7132
- 2025-07-30T11:02:57Z @tobiu referenced in commit `a3bbca7` - "String-Based VDOM Templates #7130 early stage PoC"
- 2025-07-30T23:32:19Z @tobiu referenced in commit `284497b` - "#7130 WIP"
- 2025-07-31T07:02:50Z @tobiu added sub-issue #7136
- 2025-07-31T07:32:40Z @tobiu added sub-issue #7137
- 2025-07-31T07:33:14Z @tobiu added sub-issue #7138
- 2025-07-31T07:34:19Z @tobiu added sub-issue #7139
- 2025-07-31T07:48:58Z @tobiu referenced in commit `9f58f44` - "String-Based VDOM Templates #7130 => adding the epic md file into the repo, while in development"
- 2025-07-31T07:55:35Z @tobiu added sub-issue #7140
- 2025-07-31T10:50:08Z @tobiu added sub-issue #7141
- 2025-07-31T10:50:53Z @tobiu added sub-issue #7142
- 2025-07-31T10:54:26Z @tobiu added sub-issue #7143
- 2025-07-31T10:55:01Z @tobiu added sub-issue #7144
- 2025-07-31T13:54:47Z @tobiu referenced in commit `c27cf88` - "#7130 WIP"
- 2025-07-31T14:13:05Z @tobiu referenced in commit `f2d091e` - "#7130 regex enhancement for storing non-lowercase attributes => config names"
- 2025-07-31T14:18:12Z @tobiu referenced in commit `8247da6` - "#7130 resolving all tests inside test/siesta/tests/functional/HtmlTemplateComponent.mjs"
- 2025-07-31T14:26:50Z @tobiu referenced in commit `f06c076` - "#7130 guide and epic md file update"
- 2025-07-31T14:40:19Z @tobiu referenced in commit `b1648ad` - "#7130 guide update"
- 2025-07-31T14:56:49Z @tobiu added sub-issue #7146
- 2025-07-31T19:20:05Z @tobiu added sub-issue #7147
- 2025-07-31T19:54:20Z @tobiu referenced in commit `b60c0e2` - "#7130 updated learning content for clarity (mounted vs rendered)"
- 2025-07-31T23:06:17Z @tobiu added sub-issue #7148
- 2025-07-31T23:07:00Z @tobiu added sub-issue #7149
- 2025-07-31T23:08:39Z @tobiu referenced in commit `df2dfee` - "#7130 splitting HtmlTemplateProcessor into /HtmlTemplateProcessorLogic.mjs for supporting client-side & builds (WIP)"
- 2025-07-31T23:09:34Z @tobiu referenced in commit `a16d33f` - "#7130 WIP - not fully stable yet"
- 2025-07-31T23:16:09Z @tobiu referenced in commit `bbd71b2` - "#7130 test adjustments for the rendering refactoring"
- 2025-08-01T00:05:08Z @tobiu referenced in commit `e79ab5e` - "#7130 fixed the unit tests regression"
- 2025-08-01T10:09:11Z @tobiu added sub-issue #7150
- 2025-08-01T10:33:56Z @tobiu added sub-issue #7151
- 2025-08-01T12:23:43Z @tobiu added sub-issue #7152
- 2025-08-01T12:30:44Z @tobiu referenced in commit `2b1eb64` - "#7130 processVdomForComponents() => simplification"
- 2025-08-01T13:01:31Z @tobiu added sub-issue #7153
- 2025-08-01T14:14:19Z @tobiu added sub-issue #7154
- 2025-08-01T14:40:37Z @tobiu added sub-issue #7155
- 2025-08-01T16:07:12Z @tobiu added sub-issue #7156
- 2025-08-01T16:10:45Z @tobiu referenced in commit `47b3b0e` - "#7130 functional.component.Base: only import template conversion logic for the dev mode"
- 2025-08-01T16:10:56Z @tobiu referenced in commit `d103789` - "#7130 epic update"
- 2025-08-01T17:33:53Z @tobiu referenced in commit `9f04ced` - "#7130 functional.component.Base: devmode check fix"
- 2025-08-01T23:09:25Z @tobiu referenced in commit `4901a6d` - "#7130 removed a now obsolete file"
- 2025-08-01T23:12:43Z @tobiu referenced in commit `74bc55f` - "#7130 functional.util.HtmlTemplateProcessor: docs formatting"
- 2025-08-01T23:16:08Z @tobiu referenced in commit `16b31b7` - "#7130 functional.util.HtmlTemplateProcessor: cleanup"
- 2025-08-01T23:16:43Z @tobiu referenced in commit `1abb26f` - "#7130 functional.util.HtmlTemplateProcessor: cleanup"
- 2025-08-02T11:28:46Z @tobiu added sub-issue #7158
- 2025-08-02T11:29:35Z @tobiu added sub-issue #7159
- 2025-08-02T11:30:08Z @tobiu added sub-issue #7160
- 2025-08-02T11:33:50Z @tobiu added sub-issue #7161

