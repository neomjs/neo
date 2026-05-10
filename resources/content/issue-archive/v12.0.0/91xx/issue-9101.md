---
id: 9101
title: 'Fix: Standardize Font Awesome version usage in SCSS'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-11T10:16:11Z'
updatedAt: '2026-02-11T10:18:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9101'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T10:18:55Z'
---
# Fix: Standardize Font Awesome version usage in SCSS

I noticed an inconsistency in our Font Awesome usage.
- `package.json` specifies `"@fortawesome/fontawesome-free": "^7.1.0"`.
- Some SCSS files use `"Font Awesome 7 Free"`.
- Some SCSS files (including the ones I just edited) use `"Font Awesome 6 Free"`.
- `apps/devrank/index.html` does NOT include a Font Awesome stylesheet link (it relies on the one injected by `src/MicroLoader.mjs` or similar mechanism, which usually defaults to FA5 or FA6 if not updated).

**Tasks:**
1.  Verify what version of Font Awesome is actually being loaded in the browser.
2.  Standardize the `font-family` usage in SCSS files to match the loaded version.
3.  If we are indeed using FA7, update `TreeList.scss` and `Viewport.scss` to use `"Font Awesome 7 Free"`.

**Goal:**
Ensure consistent icon rendering and avoid mixing font versions.

## Timeline

- 2026-02-11T10:16:12Z @tobiu added the `bug` label
- 2026-02-11T10:16:12Z @tobiu added the `ai` label
- 2026-02-11T10:16:12Z @tobiu added the `refactoring` label
- 2026-02-11T10:16:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-11T10:17:27Z

**Input from Gemini 3 Pro:**

> ✦ I have conducted a thorough investigation into the Font Awesome versioning issue.
> 
> **Findings:**
> 1.  **`package.json`**: Explicitly defines `"@fortawesome/fontawesome-free": "^7.1.0"`.
> 2.  **`all.min.css`**: The installed CSS file header confirms: `* Font Awesome Free 7.1.0 by @fontawesome`.
> 3.  **CSS Variable Definitions**: The `all.min.css` file defines the font family as:
>     ```css
>     --_fa-family: var(--fa-family, var(--fa-style-family, "Font Awesome 7 Free"));
>     ```
> 4.  **Inconsistency**: The codebase currently contains a mix of "Font Awesome 6 Free" and "Font Awesome 7 Free". The recent changes to `TreeList.scss` and `Viewport.scss` incorrectly used version 6.
> 
> **Resolution Plan:**
> I will proceed with standardizing all Font Awesome font-family references to **"Font Awesome 7 Free"** to match the installed package and ensure consistent rendering. This applies to:
> -   `resources/scss/src/app/content/TreeList.scss`
> -   `resources/scss/src/apps/legit/Viewport.scss`
> -   Any other discovered instances of version 6.

- 2026-02-11T10:18:39Z @tobiu referenced in commit `5032bde` - "fix: Standardize on Font Awesome 7 Free (#9101)"
### @tobiu - 2026-02-11T10:18:40Z

**Input from Gemini 3 Pro:**

> ✦ I have standardized the Font Awesome version usage in the SCSS files.
> 
> **Changes:**
> - Updated `resources/scss/src/app/content/TreeList.scss` to use `"Font Awesome 7 Free"`.
> - Updated `resources/scss/src/apps/legit/Viewport.scss` to use `"Font Awesome 7 Free"`.
> 
> This aligns the CSS font-family definitions with the installed `@fortawesome/fontawesome-free` package (v7.1.0). The search for "Font Awesome 6 Free" now yields zero results in the `resources/scss` directory.

- 2026-02-11T10:18:55Z @tobiu closed this issue
- 2026-02-11T10:21:09Z @tobiu cross-referenced by #9100

