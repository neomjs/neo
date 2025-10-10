# Ticket: Fix Root Domain SEO with Base-Href-Patched Index

GH ticket id: #7447

**Assignee:** tobiu
**Status:** To Do

**Parent Epic:** epic-enhance-neo-website-seo.md

## Description

The project's root domain (`neomjs.com`) currently uses a meta refresh, which is detrimental to SEO as it provides no content for crawlers at the most important URL.

To fix this within the constraints of GitHub Pages hosting and the need to preserve the repository's file structure for the live IDE, we will modify the deployment process.

## Acceptance Criteria

1.  The build/deployment script needs to be modified.
2.  Instead of creating a redirect file, the script must **copy** the production portal app's `index.html` (`/dist/production/apps/portal/index.html`) to the repository root (`/index.html`).
3.  The script must then **inject a `<base>` tag** into the `<head>` of this new root `index.html` file.
    -   The tag should be: `<base href="/dist/production/apps/portal/">`
4.  The outcome should be tested thoroughly to ensure:
    -   Visiting `neomjs.com` directly serves the portal app.
    -   All application assets (JS, CSS, workers) load correctly.
    -   Other top-level paths (e.g., `/apps/covid/`, `/examples/`) remain accessible and functional.
