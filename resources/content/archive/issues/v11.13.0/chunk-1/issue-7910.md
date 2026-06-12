---
id: 7910
title: 'Enhancement: Update SEO generator to support middleware-compatible routes'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T10:11:03Z'
updatedAt: '2025-11-29T11:44:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7910'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T11:41:17Z'
milestone: 11.12.0
---
# Enhancement: Update SEO generator to support middleware-compatible routes

The `buildScripts/generateSeoFiles.mjs` script needs to be updated to support the new middleware routing strategy.

Currently, the sitemap generator produces hash-based URLs (e.g., `https://neomjs.com/#/services`), which is suboptimal for SEO. The middleware will handle "real" routes (e.g., `https://neomjs.com/services`) and map them to client-side routes.

**Tasks:**
1.  Update `getSitemapXml` and `getLlmsTxt` to generate "real routes" (without the hash fragment) for the `<loc>` tags and content links.
2.  Add a new output format (e.g., `json` or `objects`) to the CLI that outputs an array of route objects. Each object should contain:
    -   `route`: The real route (e.g., `/services`)
    -   `clientSideRoute`: The hash-based route (e.g., `/#/services`)
    This will allow the middleware to easily resolve URLs and determine the correct client-side route state.

## Timeline

- 2025-11-29T10:11:04Z @tobiu added the `enhancement` label
- 2025-11-29T10:11:04Z @tobiu added the `ai` label
- 2025-11-29T10:11:31Z @tobiu assigned to @tobiu
- 2025-11-29T11:05:48Z @tobiu referenced in commit `adc10e4` - "Enhancement: Update SEO generator to support middleware-compatible routes #7910"
### @tobiu - 2025-11-29T11:06:44Z

**Input from Gemini:**

> ✦ I have refactored the route generation logic in `buildScripts/generateSeoFiles.mjs` to rely on explicit categories instead of brittle string matching (like `.html` extensions).
> 
> **Changes:**
> 1.  **Categorized Routes:** Routes are now classified as `tree` (documentation), `top-level` (SPA pages), or `file` (examples/apps).
> 2.  **Correct Pathing:**
>     -   `file` routes (examples) are treated as absolute paths (e.g., `/apps/colors/index.html`) and do not get prefixed with `/learn`.
>     -   Their `clientSideRoute` is correctly set to an empty string `""`, as they are standalone entry points, not hash-based routes within the main app.
> 3.  **Verified Output:**
>     -   `node buildScripts/generateSeoFiles.mjs --format objects` now produces the correct structure:
>         ```json
>         {
>           "route": "/apps/colors/index.html",
>           "clientSideRoute": ""
>         }
>         ```
>     -   Documentation routes (e.g., `/learn/benefits/Introduction`) are also correctly generated with their corresponding hash-based `clientSideRoute` (`/#/learn/benefits/Introduction`).

- 2025-11-29T11:41:18Z @tobiu closed this issue
- 2025-11-29T11:44:14Z @tobiu added this to the **11.12.0** milestone

