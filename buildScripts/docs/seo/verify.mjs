#!/usr/bin/env node

import {Command}                  from 'commander';
import fg                         from 'fast-glob';
import fs                         from 'fs-extra';
import os                         from 'os';
import path                       from 'path';
import {getEngineReleaseNotesRoot} from '../../util/contentRoot.mjs';
import isEntryModule              from '../../util/isEntryModule.mjs';
import {sanitizeInput}            from '../../util/sanitizer.mjs';
import createReleaseIndex         from '../index/release.mjs';
import {
    getLlmsFullTxt,
    getLlmsTxt,
    getSitemapDiscussionsXml,
    getSitemapIndexXml,
    getSitemapXml,
    getSsgArchiveRoutes
} from './generate.mjs';
import {
    getMaxReleaseMajor,
    getSeoJson,
    hasReliableGitHistory,
    isIndexableReleaseVersion,
    isRedirectMarkdown,
    resolveLearnTreeLeaves
} from './seoJson.mjs';

/**
 * @module buildScripts.docs.seo.verify
 * @summary Cross-artifact verifier and standalone CLI gate for Portal SEO and LLM discovery outputs
 * (`seo.json`, `sitemap.xml`, `sitemap-core.xml`, `sitemap-discussions.xml`, `sitemap-archive.xml`,
 * `ssg-archive-routes.json`, `llms.txt`, `llms-full.txt`, and optional `llms-all.txt`).
 *
 * Enforces structural coherence in memory before `rebuildContentIndexesAndSeo` writes to disk and
 * validates the live repository when invoked directly via `node buildScripts/docs/seo/verify.mjs`:
 * - `sitemap.xml` references `sitemap-core.xml` and `sitemap-discussions.xml`, never `sitemap-archive.xml`.
 * - Disjoint core / discussions / ticket+PR archive partitioning and `ssg-archive-routes.json` parity.
 * - `sitemap-core.xml` advertises `/` (never `/home` or `/apps/portal/index.html`), excludes `noindex`,
 *   `hidden`, `type: redirect`, and `< maxReleaseMajor - 1` release routes, and emits `<lastmod>` whenever
 *   `seo.json` carries a pre-baked `lastmod`.
 * - `seo.json` coverage across Portal routes and `blog.json` leaves, `YYYY-MM-DD` `lastmod` validity,
 *   and `robots: 'noindex, follow'` on hidden/redirect learn leaves and historical releases.
 * - On-disk existence of every `${baseUrl}/raw/*.md` target across `root`, `releaseNotesRoot`, and `corpusRoot`.
 */

const ARCHIVE_HEADINGS               = ['## GitHub Tickets', '## GitHub Pull Requests', '## GitHub Discussions'];
const ANY_ARCHIVE_ROUTE_PATTERN      = /\/news\/(?:tickets|pulls|discussions)\//;
const DISCUSSION_ROUTE_EXACT_PATTERN = /^\/news\/discussions\/[^/]+$/;
const TICKET_OR_PULL_EXACT_PATTERN   = /^\/news\/(?:tickets|pulls)\/[^/]+$/;
const RAW_ARCHIVE_PATTERN            = /\/(?:raw\/)?news\/(?:tickets|pulls|discussions)\//;
const ISO_DATE_ONLY_PATTERN          = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @summary Extracts trimmed `<loc>...</loc>` URL strings from a sitemap XML document.
 * @param {String} [xml='']
 * @returns {String[]}
 */
function extractLocUrls(xml='') {
    return Array.from(String(xml).matchAll(/<loc>(.*?)<\/loc>/g), match => match[1].trim());
}

/**
 * @summary Extracts `<url>` blocks with `{ loc, lastmod }` from a `<urlset>` XML document.
 * @param {String} [xml='']
 * @returns {Array<{loc: String, lastmod: (String|null)}>}
 */
function extractUrlEntries(xml='') {
    const entries = [];

    for (const [, block] of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const loc     = /<loc>(.*?)<\/loc>/.exec(block)?.[1]?.trim();
        const lastmod = /<lastmod>(.*?)<\/lastmod>/.exec(block)?.[1]?.trim() || null;

        if (loc) {
            entries.push({loc, lastmod});
        }
    }

    return entries;
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
        fg(['issues/**/*.md', 'archive/issues/**/issue-*.md'],                           {cwd: corpusRoot, ignore: ['**/node_modules/**']}),
        fg(['pulls/**/pr-*.md', 'archive/pulls/**/pr-*.md'],                             {cwd: corpusRoot, ignore: ['**/node_modules/**']}),
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
 * @summary Validates `ssg-archive-routes.json` structure, deterministic sorting, and exact route parity
 * against `sitemap-archive.xml`.
 * @param {Object} ssgArchiveRoutes
 * @param {String[]} archiveLocs
 */
function verifySsgArchiveRoutes(ssgArchiveRoutes, archiveLocs) {
    if (!ssgArchiveRoutes || typeof ssgArchiveRoutes !== 'object' || Array.isArray(ssgArchiveRoutes) || !Array.isArray(ssgArchiveRoutes.routes)) {
        throw new Error('ssg-archive-routes.json must be an object with a "routes" string array.');
    }

    const {routes}  = ssgArchiveRoutes;
    const seen      = new Set();
    let   previous  = null;

    for (const route of routes) {
        if (typeof route !== 'string' || !TICKET_OR_PULL_EXACT_PATTERN.test(route)) {
            throw new Error(`ssg-archive-routes.json contains invalid archive route "${route}".`);
        }

        if (seen.has(route)) {
            throw new Error(`ssg-archive-routes.json contains duplicate route "${route}".`);
        }

        if (previous !== null && previous.localeCompare(route) > 0) {
            throw new Error(`ssg-archive-routes.json routes are not deterministically sorted ("${previous}" before "${route}").`);
        }

        seen.add(route);
        previous = route;
    }

    const expectedRoutes = archiveLocs
        .map(loc => new URL(loc).pathname)
        .sort((a, b) => a.localeCompare(b));

    if (routes.length !== expectedRoutes.length || routes.some((route, index) => route !== expectedRoutes[index])) {
        throw new Error('ssg-archive-routes.json routes do not match sitemap-archive.xml entries.');
    }
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
 * @param {String} [options.sitemapDiscussionsName='sitemap-discussions.xml']
 * @param {String} options.sitemapDiscussionsXml
 * @param {String} options.sitemapIndexXml
 * @param {Object|null} [options.ssgArchiveRoutes=null]
 * @returns {Promise<void>}
 */
export async function verifySeoArtifacts(options={}) {
    const {
        baseUrl                = 'https://neomjs.com',
        corpusRoot,
        llmsAllTxt             = null,
        llmsFullTxt,
        llmsTxt,
        releaseNotesRoot,
        root                   = process.cwd(),
        seoJson,
        sitemapArchiveName     = 'sitemap-archive.xml',
        sitemapArchiveXml,
        sitemapCoreName        = 'sitemap-core.xml',
        sitemapCoreXml,
        sitemapDiscussionsName = 'sitemap-discussions.xml',
        sitemapDiscussionsXml,
        sitemapIndexXml,
        ssgArchiveRoutes       = null
    } = options;

    if (!baseUrl || typeof baseUrl !== 'string') {
        throw new Error('verifySeoArtifacts requires a non-empty baseUrl string.');
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // 1. Sitemap index & child <urlset> partitioning + duplicate checks
    if (typeof sitemapIndexXml !== 'string' || !sitemapIndexXml.includes('<sitemapindex')) {
        throw new Error('sitemap.xml must be a valid <sitemapindex> document.');
    }

    const indexLocs              = extractLocUrls(sitemapIndexXml);
    const expectedCoreUrl        = new URL(sitemapCoreName, normalizedBaseUrl).toString();
    const expectedDiscussionsUrl = new URL(sitemapDiscussionsName, normalizedBaseUrl).toString();
    const forbiddenArchiveUrl    = new URL(sitemapArchiveName, normalizedBaseUrl).toString();

    assertNoDuplicateLocs(indexLocs, 'sitemap.xml');

    if (indexLocs.includes(forbiddenArchiveUrl) || sitemapIndexXml.includes(sitemapArchiveName)) {
        throw new Error(`sitemap.xml must not reference noindex archive sitemap "${forbiddenArchiveUrl}".`);
    }

    if (/\/news\/(?:tickets|pulls)\//.test(sitemapIndexXml)) {
        throw new Error('sitemap.xml must not advertise /news/tickets/* or /news/pulls/* routes.');
    }

    if (!indexLocs.includes(expectedCoreUrl)) {
        throw new Error(`sitemap.xml is missing core child sitemap <loc> "${expectedCoreUrl}".`);
    }

    if (!indexLocs.includes(expectedDiscussionsUrl)) {
        throw new Error(`sitemap.xml is missing discussions child sitemap <loc> "${expectedDiscussionsUrl}".`);
    }

    if (typeof sitemapCoreXml !== 'string' || !sitemapCoreXml.includes('<urlset')) {
        throw new Error('sitemap-core.xml must be a valid <urlset> document.');
    }

    if (typeof sitemapDiscussionsXml !== 'string' || !sitemapDiscussionsXml.includes('<urlset')) {
        throw new Error('sitemap-discussions.xml must be a valid <urlset> document.');
    }

    if (typeof sitemapArchiveXml !== 'string' || !sitemapArchiveXml.includes('<urlset')) {
        throw new Error('sitemap-archive.xml must be a valid <urlset> document.');
    }

    const coreUrlEntries  = extractUrlEntries(sitemapCoreXml);
    const coreLocs        = extractLocUrls(sitemapCoreXml);
    const discussionLocs  = extractLocUrls(sitemapDiscussionsXml);
    const archiveLocs     = extractLocUrls(sitemapArchiveXml);

    if (coreLocs.length === 0) {
        throw new Error('sitemap-core.xml must contain at least one <loc> entry.');
    }

    assertNoDuplicateLocs(coreLocs, 'sitemap-core.xml');
    assertNoDuplicateLocs(discussionLocs, 'sitemap-discussions.xml');
    assertNoDuplicateLocs(archiveLocs, 'sitemap-archive.xml');

    const coreLocSet       = new Set(coreLocs);
    const discussionLocSet = new Set(discussionLocs);
    const corePathnameSet  = new Set();
    const expectedRootUrl  = new URL('/', normalizedBaseUrl).toString();

    for (const loc of coreLocs) {
        const pathname = new URL(loc).pathname;
        corePathnameSet.add(pathname);

        if (ANY_ARCHIVE_ROUTE_PATTERN.test(pathname)) {
            throw new Error(`sitemap-core.xml must not contain archive route "${loc}".`);
        }

        if (pathname === '/home') {
            throw new Error(`sitemap-core.xml must advertise canonical "/" rather than "${loc}".`);
        }

        if (pathname === '/apps/portal/index.html') {
            throw new Error(`sitemap-core.xml must not contain Portal shell "${loc}".`);
        }
    }

    if (!coreLocSet.has(expectedRootUrl)) {
        throw new Error(`sitemap-core.xml is missing canonical root <loc> "${expectedRootUrl}".`);
    }

    for (const loc of discussionLocs) {
        if (coreLocSet.has(loc)) {
            throw new Error(`sitemap-discussions.xml overlaps with sitemap-core.xml on "${loc}".`);
        }

        const pathname = new URL(loc).pathname;

        if (!DISCUSSION_ROUTE_EXACT_PATTERN.test(pathname)) {
            throw new Error(`sitemap-discussions.xml contains non-discussion route "${loc}".`);
        }
    }

    for (const loc of archiveLocs) {
        if (coreLocSet.has(loc)) {
            throw new Error(`sitemap-archive.xml overlaps with sitemap-core.xml on "${loc}".`);
        }

        if (discussionLocSet.has(loc)) {
            throw new Error(`sitemap-archive.xml overlaps with sitemap-discussions.xml on "${loc}".`);
        }

        const pathname = new URL(loc).pathname;

        if (DISCUSSION_ROUTE_EXACT_PATTERN.test(pathname)) {
            throw new Error(`sitemap-archive.xml must not contain discussion route "${loc}" (belongs in sitemap-discussions.xml).`);
        }

        if (!TICKET_OR_PULL_EXACT_PATTERN.test(pathname)) {
            throw new Error(`sitemap-archive.xml contains non-archive route "${loc}".`);
        }
    }

    if (ssgArchiveRoutes !== null && ssgArchiveRoutes !== undefined) {
        verifySsgArchiveRoutes(ssgArchiveRoutes, archiveLocs);
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

    // 3. seo.json coverage, lastmod format/emission, robots noindex pruning, release window, learn & blog parity
    if (!seoJson || typeof seoJson !== 'object' || Array.isArray(seoJson)) {
        throw new Error('seo.json must be a non-null plain object.');
    }

    for (const [route, entry] of Object.entries(seoJson)) {
        if (entry?.lastmod !== undefined && !ISO_DATE_ONLY_PATTERN.test(String(entry.lastmod))) {
            throw new Error(`seo.json route "${route}" has invalid lastmod "${entry.lastmod}" (expected YYYY-MM-DD).`);
        }
    }

    const coreLastmodByLoc = new Map(coreUrlEntries.map(item => [item.loc, item.lastmod]));

    for (const loc of coreLocs) {
        const pathname = new URL(loc).pathname;
        const lastmod  = coreLastmodByLoc.get(loc);

        if (lastmod !== null && lastmod !== undefined && Number.isNaN(Date.parse(lastmod))) {
            throw new Error(`sitemap-core.xml route "${loc}" has invalid <lastmod> "${lastmod}".`);
        }

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

        if (typeof entry.robots === 'string' && /\bnoindex\b/i.test(entry.robots)) {
            throw new Error(`sitemap-core.xml must not advertise noindex route "${pathname}".`);
        }

        if (entry.lastmod && !lastmod) {
            throw new Error(`sitemap-core.xml route "${pathname}" is missing <lastmod> despite seo.json lastmod "${entry.lastmod}".`);
        }
    }

    const releaseNoteFiles = await indexReleaseNoteFiles(releaseNotesRoot);
    const releaseVersions  = new Set();

    for (const fileName of releaseNoteFiles) {
        const base = fileName.replace(/\.md$/, '');
        releaseVersions.add(base.startsWith('v') ? base.slice(1) : base);
    }

    for (const route of Object.keys(seoJson)) {
        if (route.startsWith('/news/releases/')) {
            releaseVersions.add(route.slice('/news/releases/'.length));
        }
    }

    for (const pathname of corePathnameSet) {
        if (pathname.startsWith('/news/releases/')) {
            releaseVersions.add(pathname.slice('/news/releases/'.length));
        }
    }

    const maxReleaseMajor = getMaxReleaseMajor(Array.from(releaseVersions));

    if (maxReleaseMajor !== null) {
        for (const pathname of corePathnameSet) {
            if (pathname.startsWith('/news/releases/')) {
                const version = pathname.slice('/news/releases/'.length);

                if (!isIndexableReleaseVersion(version, maxReleaseMajor)) {
                    throw new Error(`sitemap-core.xml must not contain historical release route "${pathname}" (< v${maxReleaseMajor - 1}).`);
                }
            }
        }

        for (const [route, entry] of Object.entries(seoJson)) {
            if (route.startsWith('/news/releases/')) {
                const version = route.slice('/news/releases/'.length);

                if (!isIndexableReleaseVersion(version, maxReleaseMajor) && entry?.robots !== 'noindex, follow') {
                    throw new Error(`seo.json historical release route "${route}" must set robots to "noindex, follow".`);
                }
            }
        }
    }

    const treeFilePath = path.resolve(root, 'learn/tree.json');

    if (await fs.pathExists(treeFilePath)) {
        const leaves = await resolveLearnTreeLeaves({root, treeFilePath});

        for (const leaf of leaves) {
            const rawContent    = await fs.readFile(leaf.filePath, 'utf-8');
            const shouldNoindex = leaf.hidden || isRedirectMarkdown(rawContent);

            if (!shouldNoindex) {
                continue;
            }

            const route = `/learn/${String(leaf.id).replace(/^\/+/, '')}`;

            if (corePathnameSet.has(route)) {
                throw new Error(`sitemap-core.xml must not contain hidden or redirect learn route "${route}".`);
            }

            if (seoJson[route]?.robots !== 'noindex, follow') {
                throw new Error(`seo.json hidden or redirect learn route "${route}" must set robots to "noindex, follow".`);
            }
        }
    }

    const blogIndexPath = path.resolve(root, 'apps/portal/resources/data/blog.json');

    if (await fs.pathExists(blogIndexPath)) {
        const blogIndex = await fs.readJSON(blogIndexPath);
        const posts     = (Array.isArray(blogIndex?.data) ? blogIndex.data : []).filter(node => node.isLeaf && node.id);

        for (const post of posts) {
            const slug  = post.id.replace(/^blog\//, '');
            const route = `/news/blog/${slug}`;

            if (!seoJson[route] || typeof seoJson[route] !== 'object') {
                throw new Error(`seo.json is missing blog post metadata entry for "${route}".`);
            }
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

    let corpusIndex = null;

    for (const [relPath, label] of seenRelPaths.entries()) {
        const fullRawUrl = `${rawPrefix}${relPath}`;

        if (relPath.split('/').includes('..')) {
            throw new Error(`${label} contains unsafe relative /raw/ link "${fullRawUrl}".`);
        }

        if (relPath.startsWith('news/releases/')) {
            const version = relPath.slice('news/releases/'.length, -3);

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

/**
 * @summary CLI entrypoint that verifies the live checkout's tracked `seo.json` parity and full in-memory
 * SEO/LLM bundle invariants.
 * @returns {Promise<void>}
 */
async function runCli() {
    const program = new Command();

    program
        .name('verify-seo-artifacts')
        .description('Verifies Portal seo.json parity, sitemaps, ssg-archive-routes.json, and llms*.txt invariants.')
        .option('--corpus-root <path>',   'Optional conversation corpus root', sanitizeInput)
        .option('--release-notes <path>', 'Optional release-notes root (default: .github/RELEASE_NOTES)', sanitizeInput)
        .option('--base-url <url>',       'Canonical base URL (default: https://neomjs.com)', sanitizeInput);

    program.parse(process.argv);

    const opts             = program.opts();
    const root             = process.cwd();
    const baseUrl          = opts.baseUrl || 'https://neomjs.com';
    const releaseNotesRoot = opts.releaseNotes ? path.resolve(opts.releaseNotes) : getEngineReleaseNotesRoot(root);
    const seoJsonPath      = path.resolve(root, 'apps/portal/resources/data/seo.json');
    const tempWorkDir      = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-seo-verify-cli-'));
    const corpusRoot       = opts.corpusRoot ? path.resolve(opts.corpusRoot) : path.join(tempWorkDir, 'corpus');
    const tempReleasesPath = path.join(tempWorkDir, 'releases.json');

    try {
        await fs.ensureDir(corpusRoot);
        await createReleaseIndex({outputFile: tempReleasesPath, releaseNotesRoot});

        const diskSeoJson     = await fs.readJSON(seoJsonPath);
        const expectedSeoJson = await getSeoJson({releaseNotesRoot, root, seoJsonPath});

        if (JSON.stringify(diskSeoJson) !== JSON.stringify(expectedSeoJson)) {
            throw new Error('apps/portal/resources/data/seo.json is out of date with getSeoJson(). Run: node buildScripts/docs/seo/generate.mjs -f seo-json -o apps/portal/resources/data/seo.json');
        }

        if (hasReliableGitHistory(root)) {
            const missingLastmod = Object.entries(diskSeoJson)
                .filter(([, meta]) => !meta?.lastmod)
                .map(([route]) => route);

            if (missingLastmod.length > 0) {
                throw new Error(`apps/portal/resources/data/seo.json is missing lastmod on ${missingLastmod.length} route(s): ${missingLastmod.slice(0, 5).join(', ')}`);
            }
        }

        const [
            sitemapCoreXml,
            sitemapDiscussionsXml,
            sitemapArchiveXml,
            ssgArchiveRoutes,
            llmsTxt,
            llmsFullTxt,
            llmsAllTxt
        ] = await Promise.all([
            getSitemapXml({baseUrl, corpusRoot, includeArchives: false, releaseNotesRoot, root, seoJson: diskSeoJson, seoJsonPath}),
            getSitemapDiscussionsXml({baseUrl, corpusRoot, releaseNotesRoot, root}),
            getSitemapXml({baseUrl, corpusRoot, includeArchives: true, onlyArchives: true, releaseNotesRoot, root}),
            getSsgArchiveRoutes({corpusRoot}),
            getLlmsTxt({baseUrl, corpusRoot, includeArchives: false, releaseNotesRoot, releasesPath: tempReleasesPath, root}),
            getLlmsFullTxt({baseUrl, root}),
            getLlmsTxt({baseUrl, corpusRoot, includeArchives: true, releaseNotesRoot, releasesPath: tempReleasesPath, root})
        ]);

        const sitemapIndexXml = getSitemapIndexXml({
            baseUrl,
            sitemaps: [
                {path: 'sitemap-core.xml',        xml: sitemapCoreXml},
                {path: 'sitemap-discussions.xml', xml: sitemapDiscussionsXml}
            ]
        });

        await verifySeoArtifacts({
            baseUrl,
            corpusRoot,
            llmsAllTxt,
            llmsFullTxt,
            llmsTxt,
            releaseNotesRoot,
            root,
            seoJson: diskSeoJson,
            sitemapArchiveXml,
            sitemapCoreXml,
            sitemapDiscussionsXml,
            sitemapIndexXml,
            ssgArchiveRoutes
        });

        const seoRoutes    = Object.keys(diskSeoJson);
        const lastmodCount = seoRoutes.filter(route => Boolean(diskSeoJson[route]?.lastmod)).length;
        const noindexCount = seoRoutes.filter(route => diskSeoJson[route]?.robots === 'noindex, follow').length;
        const coreUrls     = extractLocUrls(sitemapCoreXml);
        const releaseCount = coreUrls.filter(loc => loc.includes('/news/releases/')).length;

        console.log(
            `SEO verification passed: seo.json routes=${seoRoutes.length}, lastmod=${lastmodCount}, ` +
            `noindex=${noindexCount}, sitemap-core urls=${coreUrls.length}, core releases=${releaseCount}`
        );
    } finally {
        await fs.remove(tempWorkDir);
    }
}

if (isEntryModule(import.meta.url)) {
    runCli().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

export default verifySeoArtifacts;
