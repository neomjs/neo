---
id: 7163
title: 'Create "Under the Hood: HTML Templates" Guide'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-02T13:12:10Z'
updatedAt: '2025-08-02T13:39:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7163'
author: tobiu
commentsCount: 0
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-02T13:39:29Z'
---
# Create "Under the Hood: HTML Templates" Guide

**Reported by:** @tobiu on 2025-08-02

---

**Parent Issue:** #7130 - String-Based VDOM Templates

---

#### 1. Summary

Create a new, in-depth guide that explains the technical implementation of the HTML template feature across all of Neo.mjs's environments. This will
serve as a companion to the existing "Using HTML Templates" guide.

#### 2. Rationale

While the existing guide explains how to use templates, it's important to document how they work to highlight the framework's architectural strengths.
This new guide will explain the different processing mechanisms for the zero-builds dev mode versus the production builds, clarifying the performance
trade-offs and showcasing the power of the build-time AST transformation.

#### 3. Scope & Implementation Plan

1. Create New File: Create a new markdown file at learn/guides/uibuildingblocks/HtmlTemplatesUnderTheHood.md.
2. Write Content: The guide will be structured as follows:
    * Introduction: Briefly state the guide's purpose – to explain the mechanics behind the html template feature. Link back to the "Using" guide for
      syntax and best practices.
    * The Core Challenge: Explain the fundamental problem: converting a standard JavaScript tagged template literal into a Neo.mjs VDOM object.
    * Mechanism 1: Zero-Builds Development Mode (Live Parsing):
        * Explain that in dev mode, the parse5 library is loaded directly into the App worker.
        * Describe the process: the html tag function triggers the HtmlTemplateProcessor, which uses parse5 to create an AST from the template string
          at runtime.
        * Clearly state the trade-off: the convenience of live parsing comes at the cost of loading the ~176KB parse5 library.
    * Mechanism 2: Production Builds (`dist/esm`, `dist/dev`, `dist/prod`):
        * Explain that for all production builds, the parse5 dependency is completely eliminated from the client-side code.
        * Describe the build-time AST transformation process:
            * The build script (astTemplateProcessor.mjs) finds all html templates.
            * It uses acorn to parse the file into a JavaScript AST.
            * It converts the template into a VDOM object and then into an AST ObjectExpression.
            * The original template is replaced with the VDOM object in the source code itself before minification.
        * Emphasize the benefit: The browser receives pre-compiled, highly optimized VDOM, resulting in zero runtime parsing overhead and maximum
          performance.
    * Conclusion: Summarize the two approaches, reinforcing that Neo.mjs provides both instant feedback for development and maximum performance for
      production.
3. Update `tree.json`: Add a new entry to learn/tree.json to make the new guide discoverable in the documentation navigation. It should be placed
   directly after the existing "HTML Templates" entry.

#### 4. Definition of Done

- The new guide learn/guides/uibuildingblocks/HtmlTemplatesUnderTheHood.md is created with the specified content.
- The learn/tree.json file is updated to include a link to the new guide.
- The documentation now clearly separates the "how-to" from the "how-it-works" for the HTML templates feature.

