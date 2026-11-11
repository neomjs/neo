import fg   from 'fast-glob';
import fs   from 'fs-extra';
import path from 'path';

/**
 * @module buildScripts.docs.seo.verify
 * @summary Cross-artifact pre-write verifier for Portal SEO and LLM discovery outputs
 * (`seo.json`, `sitemap.xml`, `sitemap-core.xml`, `sitemap-archive.xml`, `llms.txt`,
 * `llms-full.txt`, and optional `llms-all.txt`).
 *
 * Enforces structural coherence in memory before `rebuildContentIndexesAndSeo` touches disk:
 * - Child sitemap registration, `<loc>` deduplication, and strict core/archive partitioning.
 * - Curated `llms.txt` archive exclusion and non-placeholder release titles.
 * - Complete `seo.json` `title` and `description` coverage across non-static Portal routes.
 * - On-disk existence of every `${baseUrl}/raw/*.md` target across `root`, `releaseNotesRoot`, and `corpusRoot`.
 */

const ARCHIVE_HEADINGS      = ['## GitHub Tickets', '## GitHub Pull Requests', '## GitHub Discussions'];
const ARCHIVE_ROUTE_PATTERN = /\/news\/(?:tickets|pulls|discussions)\//;
const RAW_ARCHIVE_PATTERN   = /\/(?:raw\/)?news\/(?:tickets|pulls|discussions)\//;

/**
 * @summary Extracts trimmed `<loc>...</loc>` URL strings from a sitemap XML document.
 * @param {String} [xml='']
 * @returns {String[]}
 */
function extractLocUrls(xml='') {
    return Array.from(String(xml).matchAll(/<loc>(.*?)<\/loc>/g), match => match[1].trim());
}

/**
 * @summary Escapes regular-expression metacharacters in a literal string.
 * @param {String} value
 * @returns {String}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @summary Asserts that `urls` contains zero duplicate entries, throwing with the first duplicate found.
 * @param {String[]} urls
 * @param {String} artifactLabel
 */
function assertNoDuplicateLocs(urls, artifactLabel) {
    const seen = new Set();

    for (const url of urls) {
        if (seen.has(url)) {
            throw new Error(`${artifactLabel} contains duplicate <loc> entry "${url}".`);
        }

        seen.add(url);
    }
}

/**
 * @summary Indexes markdown basenames in `releaseNotesRoot` for `O(1)` `/raw/news/releases/*.md` checks.
 * @param {String|undefined} releaseNotesRoot
 * @returns {Promise<Set<String>>}
 */
async function indexReleaseNoteFiles(releaseNotesRoot) {
    const names = new Set();

    if (!releaseNotesRoot || !(await fs.pathExists(releaseNotesRoot))) {
        return names;
    }

    const files = await fg('**/*.md', {
        cwd   : releaseNotesRoot,
        ignore: ['**/node_modules/**']
    });

    for (const file of files) {
        names.add(path.basename(file));
    }

    return names;
}

/**
 * @summary Indexes active and archived ticket, pull-request, and discussion IDs under `corpusRoot`
 * for `O(1)` `/raw/news/{tickets,pulls,discussions}/*.md` checks.
 * @param {String|undefined} corpusRoot
 * @returns {Promise<{discussions: Set<String>, pulls: Set<String>, tickets: Set<String>}>}
 */
async function indexCorpusIds(corpusRoot) {
    const index = {
        discussions: new Set(),
        pulls      : new Set(),
        tickets    : new Set()
    };

    if (!corpusRoot || !(await fs.pathExists(corpusRoot))) {
        return index;
    }

    const [ticketFiles, pullFiles, discussionFiles] = await Promise.all([
        fg(['issues/**/*.md', 'archive/issues/**/issue-*.md'],                   {cwd: corpusRoot, ignore: ['**/node_modules/**']}),
        fg(['pulls/**/pr-*.md', 'archive/pulls/**/pr-*.md'],                     {cwd: corpusRoot, ignore: ['**/node_modules/**']}),
        fg(['discussions/**/discussion-*.md', 'archive/discussions/**/discussion-*.md'], {cwd: corpusRoot, ignore: ['**/node_modules/**']})
    ]);

    for (const file of ticketFiles) {
        const name = path.basename(file, '.md');
        index.tickets.add(name.startsWith('issue-') ? name.slice('issue-'.length) : name);
    }

    for (const file of pullFiles) {
        const name = path.basename(file, '.md');
        index.pulls.add(name.startsWith('pr-') ? name.slice('pr-'.length) : name);
    }

    for (const file of discussionFiles) {
        const name = path.basename(file, '.md');
        index.discussions.add(name.startsWith('discussion-') ? name.slice('discussion-'.length) : name);
    }

    return index;
}

/**
 * @summary Validates generated SEO and LLM artifacts in memory and throws an actionable `Error` on drift.
 * @param {Object} [options={}]
 * @param {String} [options.baseUrl='https://neomjs.com']
 * @param {String} [options.corpusRoot]
 * @param {String|null} [options.llmsAllTxt=null]
 * @param {String} options.llmsFullTxt
 * @param {String} options.llmsTxt
 * @param {String} [options.releaseNotesRoot]
 * @param {String} [options.root=process.cwd()]
 * @param {Object} options.seoJson
 * @param {String} [options.sitemapArchiveName='sitemap-archive.xml']
 * @param {String} options.sitemapArchiveXml
 * @param {String} [options.sitemapCoreName='sitemap-core.xml']
 * @param {String} options.sitemapCoreXml
 * @param {String} options.sitemapIndexXml
 * @returns {Promise<void>}
 */
export async function verifySeoArtifacts(options={}) {
    const {
        baseUrl            = 'https://neomjs.com',
        corpusRoot,
        llmsAllTxt         = null,
        llmsFullTxt,
        llmsTxt,
        releaseNotesRoot,
        root               = process.cwd(),
        seoJson,
        sitemapArchiveName = 'sitemap-archive.xml',
        sitemapArchiveXml,
        sitemapCoreName    = 'sitemap-core.xml',
        sitemapCoreXml,
        sitemapIndexXml
    } = options;

    if (!baseUrl || typeof baseUrl !== 'string') {
        throw new Error('verifySeoArtifacts requires a non-empty baseUrl string.');
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // 1. Sitemap index & child <urlset> partitioning + duplicate checks
    if (typeof sitemapIndexXml !== 'string' || !sitemapIndexXml.includes('<sitemapindex')) {
        throw new Error('sitemap.xml must be a valid <sitemapindex> document.');
    }

    const indexLocs          = extractLocUrls(sitemapIndexXml);
    const expectedCoreUrl    = new URL(sitemapCoreName, normalizedBaseUrl).toString();
    const expectedArchiveUrl = new URL(sitemapArchiveName, normalizedBaseUrl).toString();

    assertNoDuplicateLocs(indexLocs, 'sitemap.xml');

    if (!indexLocs.includes(expectedCoreUrl)) {
        throw new Error(`sitemap.xml is missing core child sitemap <loc> "${expectedCoreUrl}".`);
    }

    if (!indexLocs.includes(expectedArchiveUrl)) {
        throw new Error(`sitemap.xml is missing archive child sitemap <loc> "${expectedArchiveUrl}".`);
    }

    if (typeof sitemapCoreXml !== 'string' || !sitemapCoreXml.includes('<urlset')) {
        throw new Error('sitemap-core.xml must be a valid <urlset> document.');
    }

    if (typeof sitemapArchiveXml !== 'string' || !sitemapArchiveXml.includes('<urlset')) {
        throw new Error('sitemap-archive.xml must be a valid <urlset> document.');
    }

    const coreLocs   = extractLocUrls(sitemapCoreXml);
    const archiveLocs = extractLocUrls(sitemapArchiveXml);

    if (coreLocs.length === 0) {
        throw new Error('sitemap-core.xml must contain at least one <loc> entry.');
    }

    assertNoDuplicateLocs(coreLocs, 'sitemap-core.xml');
    assertNoDuplicateLocs(archiveLocs, 'sitemap-archive.xml');

    const coreLocSet = new Set(coreLocs);

    for (const loc of coreLocs) {
        const pathname = new URL(loc).pathname;

        if (ARCHIVE_ROUTE_PATTERN.test(pathname)) {
            throw new Error(`sitemap-core.xml must not contain archive route "${loc}".`);
        }
    }

    for (const loc of archiveLocs) {
        if (coreLocSet.has(loc)) {
            throw new Error(`sitemap-archive.xml overlaps with sitemap-core.xml on "${loc}".`);
        }

        const pathname = new URL(loc).pathname;

        if (!ARCHIVE_ROUTE_PATTERN.test(pathname)) {
            throw new Error(`sitemap-archive.xml contains non-archive route "${loc}".`);
        }
    }

    // 2. Curated llms.txt & llms-full.txt invariants
    if (typeof llmsTxt !== 'string' || llmsTxt.trim().length === 0) {
        throw new Error('llms.txt must be a non-empty string.');
    }

    if (typeof llmsFullTxt !== 'string' || llmsFullTxt.trim().length === 0) {
        throw new Error('llms-full.txt must be a non-empty string.');
    }

    if (RAW_ARCHIVE_PATTERN.test(llmsTxt)) {
        throw new Error('llms.txt must not contain ticket, pull-request, or discussion archive URLs.');
    }

    for (const heading of ARCHIVE_HEADINGS) {
        if (llmsTxt.includes(heading)) {
            throw new Error(`llms.txt must not contain archive section "${heading}".`);
        }
    }

    if (llmsTxt.includes(': Update](')) {
        throw new Error('llms.txt contains placeholder ": Update" release title in Latest Updates.');
    }

    // 3. seo.json coverage for non-static Portal routes in sitemap-core.xml
    if (!seoJson || typeof seoJson !== 'object' || Array.isArray(seoJson)) {
        throw new Error('seo.json must be a non-null plain object.');
    }

    for (const loc of coreLocs) {
        const pathname = new URL(loc).pathname;

        if (pathname.endsWith('.html')) {
            continue;
        }

        const entry = seoJson[pathname];

        if (!entry || typeof entry !== 'object') {
            throw new Error(`seo.json is missing metadata entry for sitemap-core.xml route "${pathname}".`);
        }

        const title       = typeof entry.title === 'string' ? entry.title.trim() : '';
        const description = typeof entry.description === 'string' ? entry.description.trim() : '';

        if (!title) {
            throw new Error(`seo.json route "${pathname}" must have a non-empty title.`);
        }

        if (!description) {
            throw new Error(`seo.json route "${pathname}" must have a non-empty description.`);
        }

        if (pathname !== '/' && pathname !== '/home' && title === 'Neo.mjs') {
            throw new Error(`seo.json deep route "${pathname}" must not fall back to bare "Neo.mjs" title.`);
        }
    }

    // 4. /raw/*.md link resolution across llms.txt, llms-full.txt, and optional llms-all.txt
    const rawPrefix  = new URL('raw/', normalizedBaseUrl).toString();
    const rawPattern = new RegExp(`${escapeRegExp(rawPrefix)}([A-Za-z0-9._/-]+\\.md)(?![A-Za-z0-9._/-])`, 'g');
    const sources    = [
        {content: llmsTxt, label: 'llms.txt'},
        {content: llmsFullTxt.replace(/```[\s\S]*?```/g, ''), label: 'llms-full.txt'},
        ...(typeof llmsAllTxt === 'string' ? [{content: llmsAllTxt, label: 'llms-all.txt'}] : [])
    ];
    const seenRelPaths = new Map();

    for (const {content, label} of sources) {
        for (const match of content.matchAll(rawPattern)) {
            const relPath = match[1];

            if (!seenRelPaths.has(relPath)) {
                seenRelPaths.set(relPath, label);
            }
        }
    }

    if (seenRelPaths.size === 0) {
        return;
    }

    let corpusIndex      = null;
    let releaseNoteFiles = null;

    for (const [relPath, label] of seenRelPaths.entries()) {
        const fullRawUrl = `${rawPrefix}${relPath}`;

        if (relPath.split('/').includes('..')) {
            throw new Error(`${label} contains unsafe relative /raw/ link "${fullRawUrl}".`);
        }

        if (relPath.startsWith('news/releases/')) {
            releaseNoteFiles ??= await indexReleaseNoteFiles(releaseNotesRoot);
            const version      = relPath.slice('news/releases/'.length, -3);

            if (!releaseNoteFiles.has(`v${version}.md`) && !releaseNoteFiles.has(`${version}.md`)) {
                throw new Error(`${label} links to missing release note "${fullRawUrl}".`);
            }
            continue;
        }

        if (relPath.startsWith('news/tickets/')) {
            corpusIndex ??= await indexCorpusIds(corpusRoot);
            const id      = relPath.slice('news/tickets/'.length, -3);

            if (!corpusIndex.tickets.has(id)) {
                throw new Error(`${label} links to missing ticket markdown "${fullRawUrl}".`);
            }
            continue;
        }

        if (relPath.startsWith('news/pulls/')) {
            corpusIndex ??= await indexCorpusIds(corpusRoot);
            const id      = relPath.slice('news/pulls/'.length, -3);

            if (!corpusIndex.pulls.has(id)) {
                throw new Error(`${label} links to missing pull-request markdown "${fullRawUrl}".`);
            }
            continue;
        }

        if (relPath.startsWith('news/discussions/')) {
            corpusIndex ??= await indexCorpusIds(corpusRoot);
            const id      = relPath.slice('news/discussions/'.length, -3);

            if (!corpusIndex.discussions.has(id)) {
                throw new Error(`${label} links to missing discussion markdown "${fullRawUrl}".`);
            }
            continue;
        }

        const resolvedPath = path.resolve(root, relPath);

        if (!(await fs.pathExists(resolvedPath))) {
            throw new Error(`${label} links to missing markdown file "${fullRawUrl}" (expected "${resolvedPath}").`);
        }
    }
}

export default verifySeoArtifacts;
