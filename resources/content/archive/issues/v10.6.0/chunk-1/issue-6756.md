---
id: 6756
title: 'Portal App: sitemap.xml'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2025-06-04T13:49:19Z'
updatedAt: '2025-09-17T02:37:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6756'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-17T02:37:07Z'
---
# Portal App: sitemap.xml

According to Gemini, we need this one.

## What is an XML Sitemap and Why is it Important for SPAs?

An XML sitemap is essentially a roadmap for search engine crawlers. It's a file that lists all the URLs on your website that you want search engines to know about and index.

For **Single Page Applications (SPAs)** like Neo.mjs's portal, a sitemap is even more important because:

* **JavaScript-Rendered Content:** While Google is excellent at crawling JavaScript, it's not perfect. A sitemap explicitly tells crawlers about all your pages, ensuring they don't miss any.
* **Deep Linking:** It helps crawlers discover deeper routes (e.g., `/services`, `/blog/my-post`) that might not be immediately linked from your initial `index.html` file.
* **Updates:** It can signal to search engines when content has been updated (`lastmod` tag).

---

## Step-by-Step Guide to Creating and Submitting Your Sitemap:

### Step 1: Identify Your Important URLs

First, list all the unique, public-facing URLs within your `neomjs.com/dist/production/apps/portal/` that you want Google to index.

Based on your navigation, these would likely include:

* `https://neomjs.com/dist/production/apps/portal/#/home` (or simply `https://neomjs.com/` if it redirects fully)
* `https://neomjs.com/dist/production/apps/portal/#/learn`
* `https://neomjs.com/dist/production/apps/portal/#/blog`
* `https://neomjs.com/dist/production/apps/portal/#/examples`
* `https://neomjs.com/dist/production/apps/portal/#/services`

And then, **all individual blog post URLs** if you have a blog. This is where it gets more complex for dynamic content. For now, focus on the static routes.

### Step 2: Create Your `sitemap.xml` File

You'll need to create a plain text file named `sitemap.xml`.

Example `sitemap.xml` structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="[http://www.sitemaps.org/schemas/sitemap/0.9](http://www.sitemaps.org/schemas/sitemap/0.9)">
   <url>
      <loc>[https://neomjs.com/dist/production/apps/portal/#/home](https://neomjs.com/dist/production/apps/portal/#/home)</loc>
      <lastmod>2025-06-04</lastmod>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
   </url>
   <url>
      <loc>[https://neomjs.com/dist/production/apps/portal/#/learn](https://neomjs.com/dist/production/apps/portal/#/learn)</loc>
      <lastmod>2025-06-04</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.8</priority>
   </url>
   <url>
      <loc>[https://neomjs.com/dist/production/apps/portal/#/blog](https://neomjs.com/dist/production/apps/portal/#/blog)</loc>
      <lastmod>2025-06-04</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
   </url>
   <url>
      <loc>[https://neomjs.com/dist/production/apps/portal/#/examples](https://neomjs.com/dist/production/apps/portal/#/examples)</loc>
      <lastmod>2025-06-04</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
   </url>
   <url>
      <loc>[https://neomjs.com/dist/production/apps/portal/#/services](https://neomjs.com/dist/production/apps/portal/#/services)</loc>
      <lastmod>2025-06-04</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.9</priority>
   </url>
   </urlset>
```

**Important Notes for SPA URLs with Hashes (`#`):**

* Search engines generally **ignore everything after the `#` (hash fragment)** in a URL when crawling for SEO purposes, as it traditionally points to an internal anchor on a page.
* However, **Google is increasingly better at rendering JavaScript** and understanding hash-based SPAs. For best practice, if you have a way to serve "clean" URLs (without the hash) or to use the HTML5 History API (`pushState`), that's preferable for SEO. But for now, list the URLs as they appear in your browser. Google will likely render the page and understand the content.
* `loc`: The **full URL** of the page.
* `lastmod`: The date the page was last modified (format `YYYY-MM-DD`). Helps Google re-crawl updated content.
* `changefreq`: How frequently the page is likely to change (`always`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`, `never`).
* `priority`: A value between 0.0 and 1.0 indicating the page's importance relative to other pages on your site. (Google typically downplays this now but it's good practice).

For Blog Posts (and other dynamic content): If your blog posts also live under hash routes (e.g., `/#/blog/my-post-title`), you'll need to manually add each of those to the sitemap. This can become tedious quickly.

### Step 3: Host Your `sitemap.xml` File on GitHub Pages

Place your created `sitemap.xml` file in the **root directory** of your GitHub Pages repository. For `neomjs.com`, this means it should be accessible at `https://neomjs.com/sitemap.xml`.

### Step 4: Submit Your Sitemap to Google Search Console

1.  **Verify Your Domain:** If you haven't already, you need to verify ownership of `neomjs.com` in Google Search Console.
    * Go to [Google Search Console](https://search.google.com/search-console).
    * Click "Start now."
    * Add a property. The easiest way is usually the "Domain" option, where you enter `neomjs.com`. You'll then be given DNS verification instructions (e.g., adding a TXT record to your domain's DNS settings). Follow these carefully.
2.  **Submit the Sitemap:**
    * Once your property is verified, navigate to the **"Sitemaps"** section in the left-hand menu of Google Search Console.
    * In the "Add a new sitemap" box, type `sitemap.xml` (or the full path if you placed it elsewhere, but root is standard).
    * Click "Submit."

### Step 5: Monitor in Google Search Console

After submission, Google will process your sitemap. This can take anywhere from a few hours to a few days. You'll be able to see:

* **Status:** Whether the sitemap was successfully processed.
* **Discovered URLs:** How many URLs Google found via the sitemap.
* **Indexing Status:** Over time, you'll see which of these URLs are being indexed and if there are any issues.

## Timeline

- 2025-06-04T13:49:19Z @tobiu assigned to @tobiu
- 2025-06-04T13:49:20Z @tobiu added the `enhancement` label
### @github-actions - 2025-09-03T02:36:22Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-09-03T02:36:23Z @github-actions added the `stale` label
### @github-actions - 2025-09-17T02:37:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-09-17T02:37:07Z @github-actions closed this issue

