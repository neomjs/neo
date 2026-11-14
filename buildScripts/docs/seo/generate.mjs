import fs                   from 'fs-extra';
import path                 from 'path';
import {Command}            from 'commander';
import fg                   from 'fast-glob';
import semver               from 'semver';
import isEntryModule        from '../../util/isEntryModule.mjs';
import {requireContentRoot} from '../../util/contentRoot.mjs';
import {sanitizeInput}      from '../../util/sanitizer.mjs';
import {
    chunkArray, collectExampleFamilyRoutes, collectExampleRoutes, extractExampleFamilyDefinitions,
    extractFrontmatterDateOnly, extractMarkdownSeoMetadata, formatLastmodDate, formatLearnSeoTitle,
    getChangedGitPaths, getChangedLastmod, getGitLastModifiedBatch, getGitPath, getMaxReleaseMajor,
    getPublishedExampleFamilies, getSeoJson, hasReliableGitHistory, isIndexableReleaseVersion,
    isRedirectMarkdown, normalizeIsoDateOnly, resolveLearnTreeLeaves
} from './seoJson.mjs';

export {
    collectExampleFamilyRoutes, collectExampleRoutes, extractExampleFamilyDefinitions, extractMarkdownSeoMetadata,
    formatLearnSeoTitle, getMaxReleaseMajor, getPublishedExampleFamilies, getSeoJson, hasReliableGitHistory,
    isIndexableReleaseVersion, isRedirectMarkdown, resolveLearnTreeLeaves
};

/**
 * @module buildScripts.docs.seo.generate
 * @summary Generates SEO and LLM context artifacts (`sitemap.xml`, `sitemap-core.xml`, `sitemap-discussions.xml`,
 * `sitemap-archive.xml`, `ssg-archive-routes.json`, `llms.txt`, `llms-full.txt`, `llms-all.txt`, and route indexes)
 * for the Neo.mjs Portal.
 *
 * Primary `sitemap-core.xml` and `llms.txt` outputs default to `includeArchives = false`, keeping crawl budget and
 * LLM context windows focused on canonical documentation, blog posts, active release notes, examples, and apps.
 * Indexable `/news/discussions/*` routes are emitted into `sitemap-discussions.xml` (referenced alongside
 * `sitemap-core.xml` in `sitemap.xml`), while `noindex` `/news/tickets/*` and `/news/pulls/*` routes remain on disk
 * in `sitemap-archive.xml` and `apps/portal/resources/data/ssg-archive-routes.json` for SSG discovery without being
 * advertised in `sitemap.xml`.
 */

const ROOT_DIR                                    = process.cwd();
const DEFAULT_BASE_PATH                           = '/learn';
const FRONTMATTER_READ_CONCURRENCY                = 128;
const ARCHIVE_ROUTE_CATEGORIES                    = new Set(['tickets', 'pull-requests', 'discussions']);
const CORPUS_FRONTMATTER_PATTERN                  = /^---\r?\n([\s\S]*?)\r?\n---/;
const CORPUS_LASTMOD_FIELDS                       = ['updatedAt', 'mergedAt', 'closedAt', 'createdAt'];
const RELEASE_NOTE_NEO_GITHUB_SOURCE_LINK_PATTERN = /https:\/\/github\.com\/neomjs\/neo\/(?:blob|tree)\/([^/\s)]+)\/[^\s)]+/g;
const RELEASE_NOTE_DISALLOWED_SOURCE_REF_PATTERN  = /^(?:main|v\d+(?:\.\d+){0,2}(?:[-.\w]*)?)$/;

// Canonical top-level routes (`/` replaces `/home` so sitemap-core.xml advertises the canonical root URL)
const TOP_LEVEL_ROUTES = [
    '/',
    '/about-us',
    '/news',
    '/docs',
    '/examples',
    '/services'
];

const PRIORITIES = new Map([
    // Top-level pages
    ['/'        , 1.0],
    ['/home'    , 1.0],
    ['/docs'    , 0.9],
    ['/examples', 0.9],
    ['/news'    , 0.9], // Boosted Priority
    ['/about-us', 0.7],
    ['/services', 0.7],

    // Identity apex: organism / Agent OS / AI engineering team
    ['benefits/Introduction'                        , 1.0],
    ['benefits/ArchitectureOverview'                , 1.0],
    ['benefits/brain/AIEngineeringTeam'             , 1.0],
    ['benefits/brain/IdentityRitualsCulture'        , 1.0],
    ['benefits/brain/AgentMemory'                   , 1.0],
    ['benefits/brain/SelfEvolution'                 , 1.0],
    ['benefits/brain/AgentOSOnYourCodebase'         , 1.0],
    ['benefits/brain/DeployingTheAgentOS'           , 1.0],

    // Body/runtime benefits
    ['benefits/body/ApplicationEngine'              , 0.9],
    ['benefits/body/ObjectPermanence'               , 0.9],
    ['benefits/body/JSONFirstUIs'                   , 0.9],
    ['benefits/body/OffTheMainThread'               , 0.9],
    ['benefits/body/FourEnvironments'               , 0.9],
    ['benefits/body/ConfigSystem'                   , 0.9],
    ['benefits/body/Quick'                          , 0.9],
    ['benefits/body/RPCLayer'                       , 0.9],
    ['benefits/body/Speed'                          , 0.9],
    ['benefits/body/MultiWindow'                    , 0.9],
    ['benefits/body/Effort'                         , 0.8],
    ['benefits/body/FormsEngine'                    , 0.8],
    ['benefits/body/Features'                       , 0.8],

    // High-value implementation guides
    ['guides/fundamentals/CodebaseOverview'         , 1.0],
    ['guides/mcp/Introduction'                      , 1.0], // AI Priority
    ['guides/mcp/NeuralLink'                        , 1.0], // AI Priority

    ['comparisons/NeoVsAngular'                     , 0.7],
    ['comparisons/NeoVsExtJs'                       , 0.7],
    ['comparisons/NeoVsNextJs'                      , 0.7],
    ['comparisons/NeoVsReact'                       , 0.7],
    ['comparisons/NeoVsSolid'                       , 0.7],
    ['comparisons/NeoVsVue'                         , 0.7],

    ['gettingstarted/ComponentModels'               , 0.8],
    ['gettingstarted/Config'                        , 0.8],
    ['gettingstarted/CreatingYourFirstApp'          , 0.9],
    ['gettingstarted/DescribingTheUI'               , 0.9],
    ['gettingstarted/Events'                        , 0.8],
    ['gettingstarted/Extending'                     , 0.8],
    ['gettingstarted/References'                    , 0.8],
    ['gettingstarted/Setup'                         , 0.9],
    ['gettingstarted/Workspaces'                    , 0.9],

    ['guides/fundamentals/ApplicationBootstrap'     , 0.9],
    ['guides/fundamentals/MainThreadAddons'         , 0.9],

    // Other important guides
    ['guides/uibuildingblocks/ComponentsAndContainers', 0.8],
    ['guides/uibuildingblocks/Layouts'                , 0.8],
    ['guides/uibuildingblocks/TabContainers'           , 0.8],
    ['guides/uibuildingblocks/DockLayouts'            , 0.8],
    ['guides/uibuildingblocks/DockLayoutsAdoption'    , 0.8],
    ['guides/uibuildingblocks/DockLayoutsStateAndPersistence', 0.8],
    ['guides/uibuildingblocks/DockLayoutsStyling'     , 0.8],
    ['guides/uibuildingblocks/DockLayoutsMechanics'   , 0.8],
    ['guides/uibuildingblocks/DockLayoutsFeatures'    , 0.8],
    ['guides/uibuildingblocks/DockLayoutsPanes'       , 0.8],
    ['guides/uibuildingblocks/DockLayoutsWindows'     , 0.8],
    ['guides/testing/DockLayoutsTesting'              , 0.8],
    ['tutorials/DockLayoutsFirstLayout'               , 0.8],
    ['guides/datahandling/Grids'                      , 0.8],
    ['guides/datahandling/Tables'                     , 0.8],
    ['guides/datahandling/UsingStores'                , 0.8],
    ['guides/userinteraction/Forms'                   , 0.8],

    // Internal evidence surfaces (hidden tree entries): registered explicitly at the floor so
    // the guide-authoring convention holds without promoting them in search.
    ['guides/specificfeatures/TearOutPortabilityMatrix', 0.1]
]);

const DEFAULT_PRIORITY = 0.5;

/**
 * Recency-tiered priority for `/news/releases/` routes, indexed by delta from the newest
 * release-note major. The current and most-recent major stay high; older patch notes decay
 * below the curated evergreen tier so the sitemap `<priority>` stays a useful crawl-budget
 * hint instead of a flat wall of release notes.
 * @type {Number[]}
 */
const RELEASE_PRIORITY_BY_DELTA = [0.9, 0.9, 0.7, 0.6, 0.5]; // index = newestMajor - releaseMajor; delta >= 5 -> 0.4

/**
 * Newest release-note major, set by `collectReleaseRoutes`; anchors the recency delta.
 * Deliberately NOT the `package.json` major, which lags the in-progress release.
 * @type {Number|null}
 */
let maxReleaseMajor = null;

/**
 * @summary Resolves the recency-tiered priority for a release-note version.
 * Anchored on the newest release-note major so the tiers self-maintain as new majors ship.
 * Returns `DEFAULT_PRIORITY` when the version is unparseable or the anchor is unknown.
 * @param {String} version Release-note version (e.g. `12.1.0`).
 * @param {Number|null} [maxMajor=maxReleaseMajor] Newest release-note major.
 * @returns {Number}
 */
export function getReleaseNotePriority(version, maxMajor=maxReleaseMajor) {
    const major = semver.coerce(version)?.major;

    if (major == null || maxMajor == null) {
        return DEFAULT_PRIORITY;
    }

    return RELEASE_PRIORITY_BY_DELTA[maxMajor - major] ?? 0.4;
}

/**
 * @summary Gets the sitemap `<priority>` value for a given route ID.
 * @param {String} id The route ID.
 * @param {Number|null} [releaseMaxMajor=maxReleaseMajor] Newest release-note major anchor.
 * @returns {Number}
 */
function getPriority(id, releaseMaxMajor=maxReleaseMajor) {
    if (id.startsWith('/news/releases/')) return getReleaseNotePriority(id.slice('/news/releases/'.length), releaseMaxMajor);
    if (id.startsWith('/news/blog/') || (id.startsWith('/examples/') && !id.endsWith('.html'))) return 0.9;
    if (id.startsWith('/news/tickets/')) return 0.5;
    if (id.startsWith('/news/pulls/')) return 0.6;
    if (id.startsWith('/news/discussions/')) return 0.4;

    const cleanId = id.endsWith('.md') ? id.slice(0, -3) : id;
    return PRIORITIES.get(cleanId) || DEFAULT_PRIORITY;
}

/**
 * @summary Finds Neo source links that point at mutable or non-existent release refs.
 * @param {String} [content=''] Markdown content to inspect.
 * @returns {String[]} Matched `github.com/neomjs/neo/(blob|tree)/<main|vX...>/...` links.
 */
export function getDisallowedReleaseNoteGithubLinks(content='') {
    return Array.from(content.matchAll(RELEASE_NOTE_NEO_GITHUB_SOURCE_LINK_PATTERN))
        .filter(match => RELEASE_NOTE_DISALLOWED_SOURCE_REF_PATTERN.test(match[1]))
        .map(match => match[0]);
}

/**
 * @summary Fails release-note route generation before non-canonical Neo source links become SEO-visible.
 * @param {Object} options
 * @param {String} options.filePath Absolute release-note markdown path.
 * @param {String} options.content Markdown content to inspect.
 * @param {String} [options.root=ROOT_DIR] Repository root.
 */
export function assertStableReleaseNoteGithubLinks({filePath, content, root=ROOT_DIR}) {
    const links = getDisallowedReleaseNoteGithubLinks(content);

    if (links.length === 0) {
        return;
    }

    const fileLabel = filePath ? getGitPath(filePath, root) : 'unknown release-note source';
    throw new Error([
        `Release-note SEO route source "${fileLabel}" contains non-canonical Neo source links.`,
        'Use the canonical dev branch for live public Neo source links; immutable commit permalinks are allowed:',
        ...links.map(link => `- ${link}`)
    ].join('\n'));
}

/**
 * @summary Reads existing sitemap `<lastmod>` values per `<url>` block for stable fallback behavior.
 * @param {String} sitemapPath Absolute path to an existing sitemap XML file.
 * @returns {Promise<Map<String, String>>} Map of `loc` URL -> `<lastmod>` string.
 */
export async function getExistingSitemapLastmodMap(sitemapPath) {
    const lastmodMap = new Map();

    if (!sitemapPath || !(await fs.pathExists(sitemapPath))) {
        return lastmodMap;
    }

    const sitemap = await fs.readFile(sitemapPath, 'utf-8');

    for (const [, block] of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const loc     = /<loc>(.*?)<\/loc>/.exec(block)?.[1],
              lastmod = /<lastmod>(.*?)<\/lastmod>/.exec(block)?.[1];

        if (loc && lastmod) {
            lastmodMap.set(loc, lastmod);
        }
    }

    return lastmodMap;
}

/**
 * @summary Resolves pre-baked `YYYY-MM-DD` `lastmod` metadata from `seo.json` for a Portal route,
 * checking both `'/'` and `'/home'` for the canonical root route.
 * @param {Object|null} seoJson
 * @param {String} routePath
 * @returns {String|null}
 */
function getSeoJsonRouteLastmod(seoJson, routePath) {
    if (!seoJson || typeof seoJson !== 'object') {
        return null;
    }

    if (routePath === '/' || routePath === '/home') {
        return normalizeIsoDateOnly(seoJson['/']?.lastmod) ||
            normalizeIsoDateOnly(seoJson['/home']?.lastmod) ||
            null;
    }

    return normalizeIsoDateOnly(seoJson[routePath]?.lastmod);
}

/**
 * @summary Collects all `learn/tree.json` routes that map to actual content files, tagging `hidden`
 * and `type: redirect` stubs so `getSitemapXml` can exclude `noindex` leaves from `sitemap-core.xml`.
 * @param {Object} [options={}]
 * @returns {Promise<Array<{category: String, filePath: String, hidden: Boolean, id: String, isRedirect: Boolean, name: (String|undefined)}>>}
 */
async function collectRoutesFromTree(options={}) {
    const leaves = await resolveLearnTreeLeaves(options);

    return Promise.all(leaves.map(async ({filePath, hidden, id, name}) => {
        const isRedirect = hidden ? false : isRedirectMarkdown(await fs.readFile(filePath, 'utf-8'));

        return {
            category: 'tree',
            filePath,
            hidden,
            id,
            isRedirect,
            name
        };
    }));
}

/**
 * @summary Collects top-level Portal routes that do not map to Markdown content files.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Promise<Array<{category: String, filePath: String, id: String}>>}
 */
async function collectTopLevelRoutes(root=ROOT_DIR) {
    const viewportControllerPath = path.resolve(root, 'apps/portal/view/ViewportController.mjs');

    return TOP_LEVEL_ROUTES.map(route => ({
        category: 'top-level',
        filePath: viewportControllerPath,
        id      : route
    }));
}

/**
 * @summary Collects all release-note routes by recursively scanning `releaseNotesRoot`.
 * @param {String} releaseNotesRoot
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Promise<Array<{category: String, filePath: String, frontmatterLastmod: (String|null), id: String, version: String}>>}
 */
async function collectReleaseRoutes(releaseNotesRoot, root=ROOT_DIR) {
    const files = await fg('**/*.md', {
        cwd   : releaseNotesRoot,
        ignore: ['**/node_modules/**']
    });

    const releases = await Promise.all(files.map(async file => {
        const filePath = path.resolve(releaseNotesRoot, file);
        const content  = await fs.readFile(filePath, 'utf-8');
        const fileName = path.basename(file, '.md');
        const version  = fileName.startsWith('v') ? fileName.substring(1) : fileName;

        assertStableReleaseNoteGithubLinks({filePath, content, root});

        return {
            category          : 'release-notes',
            filePath,
            frontmatterLastmod: extractFrontmatterDateOnly(content),
            id                : `/news/releases/${version}`,
            version
        };
    }));

    const sorted = releases.sort((a, b) => {
        const vA = semver.valid(a.version) || semver.coerce(a.version)?.version;
        const vB = semver.valid(b.version) || semver.coerce(b.version)?.version;
        return (vA && vB) ? semver.rcompare(vA, vB) : 0;
    });

    maxReleaseMajor = getMaxReleaseMajor(releases.map(release => release.version));

    return sorted;
}

/**
 * @summary Collects one route per blog post from `apps/portal/resources/data/blog.json`.
 * @param {String} [blogIndexPath] The portal's blog index.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Promise<Array<{category: String, filePath: String, id: String, name: String}>>}
 */
export async function collectBlogRoutes(blogIndexPath, root=ROOT_DIR) {
    const resolvedIndexPath = blogIndexPath || path.resolve(root, 'apps/portal/resources/data/blog.json');
    const index             = await fs.readJSON(resolvedIndexPath);
    const posts             = (Array.isArray(index?.data) ? index.data : []).filter(node => node.isLeaf && node.id);

    return Promise.all(posts.map(async post => {
        const filePath = post.path ? path.resolve(root, post.path) : null;

        if (!filePath || !await fs.pathExists(filePath)) {
            throw new Error(`Blog post "${post.id}" has no markdown file at "${post.path}".`);
        }

        const slug = post.id.replace(/^blog\//, '');

        return {
            category: 'blog',
            filePath,
            id      : `/news/blog/${slug}`,
            name    : post.name
        };
    }));
}

/**
 * @summary Selects the chronologically newer sitemap `<lastmod>` timestamp across candidate sources.
 * @param {String|null} current
 * @param {String|null} candidate
 * @returns {String|null}
 */
function pickNewerLastmod(current, candidate) {
    if (!candidate) return current || null;
    if (!current) return candidate;

    const currentMs   = Date.parse(current);
    const candidateMs = Date.parse(candidate);

    return !Number.isNaN(candidateMs) && (Number.isNaN(currentMs) || candidateMs > currentMs) ? candidate : current;
}

/**
 * @summary Extracts a normalized ISO `<lastmod>` timestamp from YAML frontmatter when present.
 * @param {String} [content='']
 * @returns {String|null}
 */
function extractCorpusFrontmatterLastmod(content='') {
    const frontmatter = CORPUS_FRONTMATTER_PATTERN.exec(content)?.[1];
    if (!frontmatter) return null;

    for (const field of CORPUS_LASTMOD_FIELDS) {
        const raw = new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm').exec(frontmatter)?.[1]?.trim();
        const ms  = raw ? Date.parse(raw) : NaN;
        if (!Number.isNaN(ms)) return formatLastmodDate(new Date(ms));
    }

    return null;
}

/**
 * @summary Reads normalized frontmatter `<lastmod>` dates for corpus markdown files in bounded batches.
 * @param {String[]} filePaths
 * @returns {Promise<Map<String, String>>}
 */
async function getCorpusFrontmatterLastmodBatch(filePaths) {
    const dateMap = new Map();

    for (const chunk of chunkArray(Array.from(new Set(filePaths)), FRONTMATTER_READ_CONCURRENCY)) {
        await Promise.all(chunk.map(async filePath => {
            const lastmod = await fs.readFile(filePath, 'utf-8').then(extractCorpusFrontmatterLastmod, () => null);
            if (lastmod) dateMap.set(filePath, lastmod);
        }));
    }

    return dateMap;
}

/**
 * @summary Collects, deduplicates by canonical route ID, and sorts numbered archive routes from `corpusRoot`.
 * @param {String} corpusRoot
 * @param {String[]} patterns Glob patterns under `corpusRoot`.
 * @param {String} filePrefix Filename prefix (`issue-`, `pr-`, `discussion-`).
 * @param {String} routePrefix Route prefix (`/news/tickets/`, `/news/pulls/`, `/news/discussions/`).
 * @param {String} category Route category.
 * @param {String} numKey Numeric sort key property name.
 * @returns {Promise<Object[]>}
 */
async function collectNumberedCorpusRoutes(corpusRoot, patterns, filePrefix, routePrefix, category, numKey) {
    const files   = (await fg(patterns, {cwd: corpusRoot, ignore: ['**/node_modules/**']}))
        .sort((a, b) => a.localeCompare(b));
    const byRoute = new Map();

    for (const file of files) {
        const filePath = path.resolve(corpusRoot, file);
        const fileName = path.basename(file, '.md');
        const numStr   = fileName.startsWith(filePrefix) ? fileName.slice(filePrefix.length) : fileName;
        const id       = `${routePrefix}${numStr}`;
        const existing = byRoute.get(id);

        if (existing) {
            existing.filePaths.push(filePath);
            continue;
        }

        const num = parseInt(numStr, 10);

        byRoute.set(id, {
            category,
            filePath,
            filePaths: [filePath],
            id,
            [numKey] : isNaN(num) ? 0 : num
        });
    }

    return Array.from(byRoute.values()).sort((a, b) => b[numKey] - a[numKey] || a.id.localeCompare(b.id));
}

const collectIssueRoutes      = root => collectNumberedCorpusRoutes(root, ['issues/**/*.md', 'archive/issues/**/issue-*.md'],                   'issue-',      '/news/tickets/',     'tickets',       'issueNum');
const collectPullRoutes       = root => collectNumberedCorpusRoutes(root, ['pulls/**/pr-*.md', 'archive/pulls/**/pr-*.md'],                     'pr-',         '/news/pulls/',       'pull-requests', 'pullNum');
const collectDiscussionRoutes = root => collectNumberedCorpusRoutes(root, ['discussions/**/discussion-*.md', 'archive/discussions/**/discussion-*.md'], 'discussion-', '/news/discussions/', 'discussions',   'discussionNum');

/**
 * @summary Collects all requested Portal routes across core documentation, apps/examples, and conversation corpus roots.
 * @param {Object} roots
 * @param {String} [roots.blogIndexPath] Optional custom `blog.json` path (test seam).
 * @param {String} roots.corpusRoot The conversation corpus root (`--corpus-root`).
 * @param {String} [roots.examplesPath] Optional custom `examples.json` path (test seam).
 * @param {String} [roots.examplesTabContainerPath] Optional custom `TabContainer.mjs` path (test seam).
 * @param {Array}  [roots.familyDefinitions] Optional custom `familyDefinitions` array (test seam).
 * @param {Boolean} [roots.includeArchives=true] Whether to collect ticket, pull-request, and discussion archive routes.
 * @param {String} [roots.learnDir] Optional custom `learn/` directory path (test seam).
 * @param {Boolean} [roots.onlyArchives=false] Whether to collect ONLY `noindex` ticket and pull-request archive routes (`sitemap-archive.xml`).
 * @param {Boolean} [roots.onlyDiscussions=false] Whether to collect ONLY indexable `/news/discussions/*` routes (`sitemap-discussions.xml`).
 * @param {String} [roots.releaseNotesRoot] The release-notes root (`--release-notes`); required when core routes are collected.
 * @param {String} [roots.root=ROOT_DIR] Repository root.
 * @param {String} [roots.treeFilePath] Optional custom `tree.json` path (test seam).
 * @returns {Promise<Array<Object>>}
 */
async function collectAllRoutes({
    blogIndexPath,
    corpusRoot,
    examplesPath,
    examplesTabContainerPath,
    familyDefinitions,
    includeArchives  = true,
    learnDir,
    onlyArchives     = false,
    onlyDiscussions  = false,
    releaseNotesRoot,
    root             = ROOT_DIR,
    treeFilePath
}) {
    corpusRoot = requireContentRoot(corpusRoot, '--corpus-root', 'generate-seo-files');

    const shouldCollectCore                 = !onlyArchives && !onlyDiscussions;
    const shouldCollectIssueAndPullArchives = onlyArchives || (!onlyDiscussions && includeArchives);
    const shouldCollectDiscussions          = onlyDiscussions || (!onlyArchives && includeArchives);

    if (shouldCollectCore) {
        releaseNotesRoot = requireContentRoot(releaseNotesRoot, '--release-notes', 'generate-seo-files');
    }

    return (await Promise.all([
        shouldCollectCore                 ? collectTopLevelRoutes(root)                                                                   : [],
        shouldCollectCore                 ? collectExampleFamilyRoutes({examplesPath, examplesTabContainerPath, familyDefinitions, root}) : [],
        shouldCollectCore                 ? collectRoutesFromTree({learnDir, root, treeFilePath})                                         : [],
        shouldCollectCore                 ? collectExampleRoutes(root)                                                                    : [],
        shouldCollectCore                 ? collectReleaseRoutes(releaseNotesRoot, root)                                                  : [],
        shouldCollectCore                 ? collectBlogRoutes(blogIndexPath, root)                                                        : [],
        shouldCollectIssueAndPullArchives ? collectIssueRoutes(corpusRoot)                                                                : [],
        shouldCollectIssueAndPullArchives ? collectPullRoutes(corpusRoot)                                                                 : [],
        shouldCollectDiscussions          ? collectDiscussionRoutes(corpusRoot)                                                           : []
    ])).flat();
}

/**
 * @summary Normalizes a route ID into a real or hash-prefixed Portal path.
 * @param {String} id
 * @param {String|null} [basePath=null] Only used for content routes (e.g., `'/learn'`).
 * @param {Boolean} [useHash=true] Whether to prepend `/#` to the route.
 * @returns {String}
 */
function buildRouteFromId(id, basePath=null, useHash=true) {
    if (id.startsWith('/')) {
        return useHash ? `/#${id}` : id;
    }

    const trimmedBase = (basePath ?? DEFAULT_BASE_PATH).replace(/\/$/, '');
    const trimmedId   = id.replace(/^\//, '');
    const prefix      = trimmedBase.length > 0 ? trimmedBase : '';
    const route       = `${prefix}/${trimmedId}`.replace(/\/+/g, '/');
    const fullRoute   = route.startsWith('/') ? route : `/${route}`;

    return useHash ? `/#${fullRoute}` : fullRoute;
}

/**
 * @summary Formats a route descriptor according to its category (`file`, `top-level`/`example-family`, or `tree`).
 * @param {String} category
 * @param {String} id
 * @param {String} basePath
 * @param {Boolean} useHash
 * @returns {String}
 */
function formatCategoryRoute(category, id, basePath, useHash) {
    if (category === 'file') return id;
    if (category === 'top-level' || category === 'example-family') return buildRouteFromId(id, null, useHash);
    return buildRouteFromId(id, basePath, useHash);
}

/**
 * @summary Generates a normalized, sorted list of all hash-prefixed SPA routes.
 * @param {Object} [options={}]
 * @returns {Promise<String[]>}
 */
export async function getContentRoutes(options={}) {
    const {basePath = DEFAULT_BASE_PATH, includeTopLevel = true} = options;
    const allRoutes = await collectAllRoutes(options);

    return allRoutes
        .filter(({id}) => includeTopLevel || !id.startsWith('/'))
        .map(({category, id}) => formatCategoryRoute(category, id, basePath, true))
        .sort((a, b) => a.localeCompare(b));
}

/**
 * @summary Generates a sorted list of route objects containing both real and client-side hash routes.
 * @param {Object} [options={}]
 * @returns {Promise<Array<{route: String, clientSideRoute: String}>>}
 */
export async function getContentRouteObjects(options={}) {
    const {basePath = DEFAULT_BASE_PATH, includeTopLevel = true} = options;
    const allRoutes = await collectAllRoutes(options);

    return allRoutes
        .filter(({id}) => includeTopLevel || !id.startsWith('/'))
        .map(({category, id}) => ({
            route          : formatCategoryRoute(category, id, basePath, false),
            clientSideRoute: category === 'file' ? '' : formatCategoryRoute(category, id, basePath, true)
        }))
        .sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * @summary Returns fully qualified URLs for all routes.
 * @param {Object} [options={}]
 * @returns {Promise<String[]>}
 */
export async function getContentUrls(options={}) {
    const {baseUrl} = options;
    const routes    = await getContentRoutes(options);

    if (!baseUrl) {
        return routes;
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return routes.map(route => new URL(route, normalizedBaseUrl).toString());
}

/**
 * @summary Builds the deterministic SSG route list (`{ routes: string[] }`) for `noindex` GitHub ticket
 * and pull-request archive pages (`apps/portal/resources/data/ssg-archive-routes.json`) so `neomjs/pages`
 * SSG can pre-render `/news/tickets/*` and `/news/pulls/*` without scraping `sitemap-archive.xml`.
 * @param {Object} [options={}]
 * @param {String} options.corpusRoot Conversation corpus root holding `issues/`, `pulls/`, and `archive/`.
 * @returns {Promise<{routes: String[]}>}
 */
export async function getSsgArchiveRoutes(options={}) {
    const corpusRoot = requireContentRoot(options.corpusRoot, '--corpus-root', 'generate-seo-files');
    const [issueRoutes, pullRoutes] = await Promise.all([
        collectIssueRoutes(corpusRoot),
        collectPullRoutes(corpusRoot)
    ]);

    const routes = Array.from(new Set([
        ...issueRoutes.map(route => route.id),
        ...pullRoutes.map(route => route.id)
    ])).sort((a, b) => a.localeCompare(b));

    return {routes};
}

/**
 * @summary Formats curated, discussion, or archive routes as a sitemap `<urlset>` XML string, pruning
 * `hidden` and `type: redirect` learn stubs and historical release notes (`< maxReleaseMajor - 1`) from
 * `sitemap-core.xml` and falling back to pre-baked `seo.json` `lastmod` dates when `.git` is absent.
 * @param {Object} [options={}]
 * @param {String} options.corpusRoot The conversation corpus root, see {@link collectAllRoutes}.
 * @param {String} [options.releaseNotesRoot] The release-notes root (required when core routes are collected).
 * @param {String} options.baseUrl Absolute base URL required for sitemap entries.
 * @param {String} [options.basePath='/learn'] Base path for learn content routes.
 * @param {Boolean} [options.includeArchives=false] Whether to include ticket, PR, and discussion archive routes.
 * @param {Boolean} [options.onlyArchives=false] Whether to include ONLY ticket and PR archive routes (`sitemap-archive.xml`).
 * @param {Boolean} [options.onlyDiscussions=false] Whether to include ONLY indexable discussion routes (`sitemap-discussions.xml`).
 * @param {Boolean} [options.includeLastmod=true] Whether to emit `<lastmod>` tags.
 * @param {Boolean} [options.includeTopLevel] Whether to include top-level Portal routes.
 * @param {String} [options.existingSitemapPath] Existing sitemap path for stable `<lastmod>` fallback.
 * @param {Object} [options.seoJson] Optional in-memory `seo.json` map for `.git`-less `<lastmod>` fallback.
 * @param {String} [options.seoJsonPath] Optional custom `seo.json` path on disk for `.git`-less `<lastmod>` fallback.
 * @param {String} [options.root=ROOT_DIR] Repository root.
 * @returns {Promise<String>}
 */
export async function getSitemapXml(options={}) {
    const {
        baseUrl,
        basePath        = DEFAULT_BASE_PATH,
        existingSitemapPath,
        onlyArchives    = false,
        onlyDiscussions = false,
        includeArchives = onlyArchives || onlyDiscussions,
        includeLastmod  = true,
        includeTopLevel = !onlyArchives && !onlyDiscussions,
        root            = ROOT_DIR,
        seoJson,
        seoJsonPath
    } = options;

    if (!baseUrl) {
        throw new Error('getSitemapXml requires a baseUrl option to produce absolute URLs.');
    }

    const allRoutes = await collectAllRoutes({
        ...options,
        includeArchives,
        onlyArchives,
        onlyDiscussions,
        root
    });

    const localMaxReleaseMajor = getMaxReleaseMajor(
        allRoutes
            .filter(route => route.category === 'release-notes')
            .map(route => route.version)
    );

    const filteredRoutes = allRoutes.filter(route => {
        if (route.hidden || route.isRedirect) {
            return false;
        }

        if (route.category === 'release-notes' && !isIndexableReleaseVersion(route.version, localMaxReleaseMajor)) {
            return false;
        }

        return onlyArchives || onlyDiscussions || includeTopLevel || !route.id.startsWith('/');
    });

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    let changedGitPaths       = new Set();
    let existingLastmodMap    = new Map();
    let frontmatterLastmodMap = new Map();
    let lastModMap            = new Map();
    let resolvedSeoJson       = seoJson || null;

    if (includeLastmod) {
        const gitTargetPaths   = [];
        const archiveFilePaths = [];

        for (const {category, id, filePath, filePaths} of filteredRoutes) {
            const candidatePaths = filePaths || (filePath ? [filePath] : []);

            for (const candidatePath of candidatePaths) {
                if (ARCHIVE_ROUTE_CATEGORIES.has(category)) {
                    archiveFilePaths.push(candidatePath);
                }

                gitTargetPaths.push(id.endsWith('.html') ? path.dirname(candidatePath) : candidatePath);
            }
        }

        changedGitPaths       = getChangedGitPaths(root);
        lastModMap            = getGitLastModifiedBatch(gitTargetPaths, root);
        frontmatterLastmodMap = await getCorpusFrontmatterLastmodBatch(archiveFilePaths);

        if (existingSitemapPath) {
            existingLastmodMap = await getExistingSitemapLastmodMap(existingSitemapPath);
            changedGitPaths.delete(getGitPath(existingSitemapPath, root));
        }

        if (!resolvedSeoJson && !onlyArchives && !onlyDiscussions) {
            const candidateSeoPath = seoJsonPath || path.resolve(root, 'apps/portal/resources/data/seo.json');

            if (await fs.pathExists(candidateSeoPath)) {
                try {
                    resolvedSeoJson = await fs.readJSON(candidateSeoPath);
                } catch {
                    resolvedSeoJson = null;
                }
            }
        }
    }

    const entriesByUrl = new Map();

    for (const {category, id, filePath, filePaths, frontmatterLastmod} of filteredRoutes) {
        const routePath = formatCategoryRoute(category, id, basePath, false);
        const url       = new URL(routePath, normalizedBaseUrl).toString();

        let lastmod = null;
        if (includeLastmod) {
            const candidatePaths = filePaths || (filePath ? [filePath] : []);
            const isArchiveRoute = ARCHIVE_ROUTE_CATEGORIES.has(category);

            for (const candidatePath of candidatePaths) {
                const key            = category === 'file' ? path.dirname(candidatePath) : candidatePath;
                const gitPath        = getGitPath(key, root);
                const changedLastmod = gitPath.startsWith('../')
                    ? null
                    : getChangedLastmod(gitPath, changedGitPaths, category === 'file', root);

                const candidateLastmod = isArchiveRoute
                    ? (frontmatterLastmodMap.get(candidatePath) || changedLastmod || lastModMap.get(key) || null)
                    : (changedLastmod || lastModMap.get(key) || null);

                lastmod = pickNewerLastmod(lastmod, candidateLastmod);
            }

            if (isArchiveRoute) {
                if (!lastmod) {
                    lastmod = existingLastmodMap.get(url) || null;
                }
            } else if (!lastmod) {
                const seoJsonLastmod = getSeoJsonRouteLastmod(resolvedSeoJson, routePath) || frontmatterLastmod || null;
                lastmod = pickNewerLastmod(existingLastmodMap.get(url) || null, seoJsonLastmod);
            }
        }

        const priority      = getPriority(id, localMaxReleaseMajor);
        const existingEntry = entriesByUrl.get(url);

        if (existingEntry) {
            existingEntry.lastmod = pickNewerLastmod(existingEntry.lastmod, lastmod);
        } else {
            entriesByUrl.set(url, {lastmod, priority, url});
        }
    }

    const xmlEntries = Array.from(entriesByUrl.values()).map(({lastmod, priority, url}) => {
        const lastmodXml = lastmod
            ? `\n    <lastmod>${lastmod}</lastmod>`
            : '';

        const priorityXml = priority !== DEFAULT_PRIORITY
            ? `\n    <priority>${priority.toFixed(1)}</priority>`
            : '';

        return `  <url>
    <loc>${url}</loc>${lastmodXml}${priorityXml}
  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>
`;
}

/**
 * @summary Formats indexable `/news/discussions/*` routes as the standalone `sitemap-discussions.xml` `<urlset>`.
 * @param {Object} [options={}]
 * @returns {Promise<String>}
 */
export async function getSitemapDiscussionsXml(options={}) {
    return getSitemapXml({
        ...options,
        includeArchives: true,
        onlyArchives   : false,
        onlyDiscussions: true
    });
}

/**
 * @summary Extracts the chronologically newest `<lastmod>` value from a sitemap `<urlset>` XML string.
 * @param {String} [sitemapXml=''] Sitemap XML content.
 * @returns {String|null}
 */
export function getLatestSitemapLastmod(sitemapXml='') {
    let latestMs  = -Infinity;
    let latestStr = null;

    for (const [, lastmod] of sitemapXml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)) {
        const ms = Date.parse(lastmod);

        if (!Number.isNaN(ms) && ms > latestMs) {
            latestMs  = ms;
            latestStr = lastmod;
        } else if (latestStr === null && lastmod) {
            latestStr = lastmod;
        }
    }

    return latestStr;
}

/**
 * @summary Formats a Sitemap Index (`<sitemapindex>`) referencing indexable child sitemaps
 * (`sitemap-core.xml` and `sitemap-discussions.xml`, never `noindex` `sitemap-archive.xml`).
 * @param {Object} [options={}]
 * @param {String} options.baseUrl Absolute base URL required for sitemap index entries.
 * @param {Array<{path: (String|undefined), loc: (String|undefined), xml: (String|undefined), lastmod: (String|undefined)}>} [options.sitemaps] Child sitemap descriptors.
 * @returns {String}
 */
export function getSitemapIndexXml(options={}) {
    const {
        baseUrl,
        sitemaps = [
            {path: 'sitemap-core.xml'},
            {path: 'sitemap-discussions.xml'}
        ]
    } = options;

    if (!baseUrl) {
        throw new Error('getSitemapIndexXml requires a baseUrl option to produce absolute URLs.');
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    const entriesXml = sitemaps.map(entry => {
        const target  = entry.loc || entry.path;
        const url     = new URL(target, normalizedBaseUrl).toString();
        const lastmod = entry.lastmod ?? (entry.xml ? getLatestSitemapLastmod(entry.xml) : null);

        const lastmodXml = lastmod
            ? `\n    <lastmod>${lastmod}</lastmod>`
            : '';

        return `  <sitemap>
    <loc>${url}</loc>${lastmodXml}
  </sitemap>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entriesXml}
</sitemapindex>
`;
}

/**
 * @summary Formats curated content URLs for `llms.txt` consumption, excluding raw ticket/PR/discussion
 * archives unless `includeArchives` is set (`llms-all.txt`).
 * @param {Object} [options={}]
 * @returns {Promise<String>}
 */
export async function getLlmsTxt(options={}) {
    const {
        baseUrl,
        basePath        = DEFAULT_BASE_PATH,
        includeArchives = false,
        root            = ROOT_DIR,
        releasesPath    = path.resolve(root, 'apps/portal/resources/data/releases.json')
    } = options;
    const allRoutes = await collectAllRoutes({...options, includeArchives, root});

    let content = `# Neo.mjs: An Agent Institution

> Neo.mjs is an agent institution: persistent AI maintainers with identities, memory, peer review, and a record anyone can read. Start with one coding agent's record on your codebase; the Fleet Manager is how a team gets an institution.
> Behind it stands a self-evolving software organism: a professional, end-to-end AI engineering team whose Body, Brain and Institution live in sibling open-source repositories.
> Its Institution (github.com/neomjs/neo-agent-institution) is the Fleet Manager: it starts the agent harnesses over the Brain's Fleet transport, and agents reach it through the Neural Link like any Neo app.
> Its Brain (github.com/neomjs/neo-agent-brain) is the Agent OS: Memory Core, Knowledge Base, Native Edge Graph, A2A coordination, GitHub Workflow, DreamService, and Active Hybrid GraphRAG.
> Its Body (github.com/neomjs/neo, /src) is the production multi-threaded application engine: App Worker, VDom Worker, Data Worker, Canvas Worker, SharedWorker, JSON VDOM blueprints, object permanence, and zero-build ES modules.
> The Neural Link is the possession interface between them. Agents inspect semantic runtime state, mutate UI and data in live apps, hot-patch behavior, and verify changes inside running software.
> Self-healing loops turn runtime failures, code defects, agent mistakes, and architectural friction into fixes, tickets, skills, memory, and new graph topology for the next cycle.

> **Body Runtime Capabilities:**
> * **Off-Main-Thread execution:** Application logic, state, JSON VDOM diffing, and data processing run in workers so the main thread stays focused on DOM patching.
> * **Persistent Scene Graph:** Components are stateful objects with identity and methods, not transient DOM snapshots.
> * **JSON-first UI:** Serializable blueprints map cleanly to LLM generation and worker isolation.
> * **Zero Build Step:** Native ES modules run directly in the browser; bundled outputs remain deployment options, not the source of truth.

> **Agent OS Capabilities:**
> * **Cross-model swarm:** Claude, Gemini, and GPT maintainers coordinate through persistent Memory Core and A2A messages.
> * **Active Hybrid GraphRAG:** Knowledge Base plus Native Edge Graph route agents through source, docs, issues, PRs, and learned topology.
> * **DreamService / Golden Path:** REM cycles distill noisy sessions into priority-weighted graph structure.
> * **MCP server surface:** Frontier harnesses use Knowledge Base, Memory Core, GitHub Workflow, and Neural Link; internal Neo.ai.Agent local loops also use File System.

Neo.mjs uniquely deploys each application and example in four equivalent environments.
The URLs listed below use the **development mode** paths (Zero Build), which embody the core philosophy.
To access bundled versions, prefix paths with \`/dist/production/\`, \`/dist/development/\`, or \`/dist/esm/\`.

`;

    if (await fs.pathExists(releasesPath)) {
        try {
            const releases = await fs.readJSON(releasesPath);

            if (Array.isArray(releases) && releases.length > 0) {
                const actualReleases = releases.filter(r => r.isLeaf !== false && r.id);

                if (actualReleases.length > 0) {
                    content += `## Latest Updates\n\n`;
                    actualReleases.slice(0, 5).forEach(release => {
                        const version = release.id;
                        const date    = release.date ? ` (${release.date.split('T')[0]})` : '';
                        const title   = release.title || 'Update';
                        const url     = new URL(`raw/news/releases/${version}.md`, baseUrl).toString();

                        content += `- [v${version}${date}: ${title}](${url})\n`;
                    });
                    content += `\n`;
                }
            }
        } catch {
            console.warn('Found releases.json but failed to parse it. Skipping "Latest Updates" section.');
        }
    }

    const topLevelRoutes      = allRoutes.filter(route => route.category === 'top-level');
    const exampleFamilyRoutes = allRoutes.filter(route => route.category === 'example-family');
    const releaseRoutes       = allRoutes.filter(route => route.category === 'release-notes');
    const blogRoutes          = allRoutes.filter(route => route.category === 'blog');
    const ticketRoutes        = allRoutes.filter(route => route.category === 'tickets');
    const pullRoutes          = allRoutes.filter(route => route.category === 'pull-requests');
    const discussionRoutes    = allRoutes.filter(route => route.category === 'discussions');
    const exampleRoutes       = allRoutes.filter(route => route.category === 'file');
    const contentRoutes       = allRoutes.filter(route => route.category === 'tree');

    content += `## Main Pages\n\n`;
    const topLevelUrls = topLevelRoutes.map(route => {
        const name = route.id === '/' ? 'Home' :
            route.id === '/services' ? 'Connect' :
            route.id.substring(1).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

        let urlStr;
        if (route.filePath && route.filePath.endsWith('.md')) {
            const relativePath = path.relative(root, route.filePath).split(path.sep).join('/');
            urlStr = new URL(`raw/${relativePath}`, baseUrl).toString();
        } else {
            const routeStr = buildRouteFromId(route.id, null, false);
            urlStr = new URL(routeStr, baseUrl).toString();
        }

        return `- [${name}](${urlStr})`;
    });
    content += topLevelUrls.join('\n') + '\n\n';

    if (exampleFamilyRoutes.length > 0 || exampleRoutes.length > 0) {
        content += `## Demo Apps and Examples\n\n`;
        const exampleUrls = [
            ...exampleFamilyRoutes.map(route => `- [${route.name}](${new URL(buildRouteFromId(route.id, null, false), baseUrl).toString()})`),
            ...exampleRoutes.map(route => `- [${route.name}](${new URL(route.id, baseUrl).toString()})`)
        ];
        content += exampleUrls.join('\n') + '\n\n';
    }

    content += `## Content & Documentation Layout\n` +
               `The sections below (Release Notes, Guides/Blogs, GitHub Tickets, Pull Requests, and Discussions) represent pure technical content. ` +
               `When human users navigate to these routes, Neo.mjs serves a persistent, desktop-class Single Page Application. The visual layout consists of:\n` +
               `- A top Header Toolbar with main site context.\n` +
               `- A functional left-hand \`Neo.tree.List\` sidebar for hierarchical navigation.\n` +
               `- A right-hand \`Neo.list.Base\` sidebar featuring anchor links for in-page navigation (e.g. sections and ticket metadata).\n` +
               `- A primary Article container where the Markdown content renders.\n` +
               `- Interactive Next/Previous controls for navigating sequential documentation or tickets.\n\n`;

    if (releaseRoutes.length > 0) {
        content += `## Release Notes\n\n`;
        content += `Here you find the full history of Neo.mjs updates.\n\n`;
        const mappedUrls = releaseRoutes.map(route => {
            const name      = `v${route.version}`;
            const cleanPath = route.id.startsWith('/') ? route.id.substring(1) : route.id;
            const urlStr    = new URL(`raw/${cleanPath}.md`, baseUrl).toString();
            return `- [${name}](${urlStr})`;
        });
        content += mappedUrls.join('\n') + '\n\n';
    }

    if (blogRoutes.length > 0) {
        content += `## Blog\n\n`;
        const mappedUrls = blogRoutes.map(route => {
            const relativePath = path.relative(root, route.filePath).split(path.sep).join('/');
            const urlStr       = new URL(`raw/${relativePath}`, baseUrl).toString();
            return `- [${route.name}](${urlStr})`;
        });
        content += mappedUrls.join('\n') + '\n\n';
    }

    const topLevelFolders = contentRoutes.reduce((acc, node) => {
        const parts = node.id.split('/');
        if (parts.length > 1) {
            const folder = parts[0];
            if (!acc[folder]) {
                acc[folder] = [];
            }
            acc[folder].push(node);
        }
        return acc;
    }, {});

    for (const folder in topLevelFolders) {
        const header = folder.charAt(0).toUpperCase() + folder.slice(1);
        content += `## ${header}\n\n`;
        const urls = topLevelFolders[folder].map(node => {
            let urlStr;
            if (node.filePath && node.filePath.endsWith('.md')) {
                const relativePath = path.relative(root, node.filePath).split(path.sep).join('/');
                urlStr = new URL(`raw/${relativePath}`, baseUrl).toString();
            } else {
                const route = buildRouteFromId(node.id, basePath, false);
                urlStr = new URL(route, baseUrl).toString();
            }
            return `- [${node.name}](${urlStr})`;
        });
        content += urls.join('\n') + '\n\n';
    }

    const archiveSections = [
        ['GitHub Tickets',       'Here you find historical technical discussions and GitHub issues.',     ticketRoutes,     'Ticket',       'issueNum'],
        ['GitHub Pull Requests', 'Here you find problem-to-solution records from Neo.mjs pull requests.', pullRoutes,       'Pull Request', 'pullNum'],
        ['GitHub Discussions',   'Here you find Ideation Sandbox and architectural discussion records.',  discussionRoutes, 'Discussion',   'discussionNum']
    ];

    for (const [heading, intro, routes, label, key] of archiveSections) {
        if (routes.length > 0) {
            const lines = routes.map(route => `- [${label} #${route[key]}](${new URL(`raw/${route.id.replace(/^\//, '')}.md`, baseUrl).toString()})`);
            content += `## ${heading}\n\n${intro}\n\n${lines.join('\n')}\n\n`;
        }
    }

    if (!includeArchives && baseUrl) {
        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const llmsFullUrl       = new URL('llms-full.txt', normalizedBaseUrl).toString();
        const llmsAllUrl        = new URL('llms-all.txt', normalizedBaseUrl).toString();

        content += `## Optional\n\n`;
        content += `- [Full Documentation Atlas (llms-full.txt)](${llmsFullUrl}): Complete concatenated Markdown prose for all core Neo.mjs guides and architectural documentation.\n`;
        content += `- [Complete Archive Index (llms-all.txt)](${llmsAllUrl}): Exhaustive index including all historical GitHub tickets, pull requests, and Ideation Sandbox discussions.\n\n`;
    }

    return content;
}

/**
 * @summary Generates `llms-full.txt` by concatenating the full Markdown prose of all core documentation
 * guides in `learn/tree.json`.
 * @param {Object} [options={}]
 * @returns {Promise<String>}
 */
export async function getLlmsFullTxt(options={}) {
    const {
        baseUrl      = 'https://neomjs.com',
        basePath     = DEFAULT_BASE_PATH,
        root         = ROOT_DIR,
        learnDir     = path.resolve(root, 'learn'),
        treeFilePath = path.join(learnDir, 'tree.json')
    } = options;

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const leaves            = await resolveLearnTreeLeaves({learnDir, root, treeFilePath});
    const sections          = [];

    for (const leaf of leaves) {
        const rawContent   = await fs.readFile(leaf.filePath, 'utf-8');
        const cleanId      = leaf.id.replace(/^\//, '');
        const rawUrl       = new URL(`raw/learn/${cleanId}.md`, normalizedBaseUrl).toString();
        const route        = buildRouteFromId(leaf.id, basePath, false);
        const canonicalUrl = new URL(route, normalizedBaseUrl).toString();
        const title        = leaf.name || cleanId;

        sections.push([
            `# [${title}](${rawUrl})`,
            `Source: ${canonicalUrl}`,
            '',
            rawContent.trim()
        ].join('\n'));
    }

    const llmsTxtUrl = new URL('llms.txt', normalizedBaseUrl).toString();
    const llmsAllUrl = new URL('llms-all.txt', normalizedBaseUrl).toString();

    const header = [
        '# Neo.mjs: Full Documentation Atlas (llms-full.txt)',
        '',
        '> Complete concatenated Markdown documentation for the Neo.mjs application engine and Agent OS (`learn/tree.json`).',
        `> For the lightweight curated route map, see [llms.txt](${llmsTxtUrl}). For the exhaustive GitHub ticket, pull-request, and discussion index, see [llms-all.txt](${llmsAllUrl}).`
    ].join('\n');

    return sections.length > 0
        ? `${header}\n\n---\n\n${sections.join('\n\n---\n\n')}\n`
        : `${header}\n`;
}

/**
 * @summary CLI entrypoint for generating individual SEO and LLM discovery artifacts.
 * @returns {Promise<void>}
 */
async function runCli() {
    const program = new Command();

    program
        .name('generate-seo-files')
        .description('Generates sitemap.xml, ssg-archive-routes.json, seo.json, and llms.txt for SEO purposes.')
        .option('--corpus-root <path>',   'Conversation corpus root holding issues/, pulls/, discussions/ and archive/', sanitizeInput)
        .option('--release-notes <path>', 'Release-notes root', sanitizeInput)
        .option('-f, --format <type>', 'Output format: array, objects, urls, xml, xml-discussions, xml-index, ssg-archive-routes, llms, llms-full, seo-json', sanitizeInput)
        .option('--base-url <url>',    'Absolute base URL (e.g., https://neomjs.com)',   sanitizeInput)
        .option('--base-path <path>',  'Base path for content routes',                   sanitizeInput)
        .option('-o, --output <path>', 'Output file path',                               sanitizeInput)
        .option('--include-archives',  'Include raw ticket, pull-request, and discussion archive routes in sitemap.xml and llms.txt')
        .option('--only-archives',     'Include ONLY raw ticket and pull-request archive routes in sitemap-archive.xml')
        .option('--only-discussions',  'Include ONLY indexable discussion routes in sitemap-discussions.xml')
        .option('--no-lastmod',        'Exclude <lastmod> tags from sitemap.xml')
        .option('--no-top-level',      'Exclude top-level routes');

    program.parse(process.argv);

    const programOpts     = program.opts();
    const format          = (programOpts.format || 'array').toLowerCase();
    const baseUrl         = programOpts.baseUrl;
    const basePath        = programOpts.basePath || DEFAULT_BASE_PATH;
    const output          = programOpts.output;
    const outputPath      = output ? path.resolve(ROOT_DIR, output) : null;
    const onlyArchives    = Boolean(programOpts.onlyArchives);
    const onlyDiscussions = Boolean(programOpts.onlyDiscussions);
    const includeArchives = Boolean(programOpts.includeArchives) || onlyArchives || onlyDiscussions;
    const includeLastmod  = programOpts.noLastmod === undefined ? true : !programOpts.noLastmod;
    const includeTopLevel = programOpts.noTopLevel === undefined ? true : !programOpts.noTopLevel;
    const roots           = {
        corpusRoot      : programOpts.corpusRoot ? path.resolve(programOpts.corpusRoot) : undefined,
        releaseNotesRoot: programOpts.releaseNotes ? path.resolve(programOpts.releaseNotes) : undefined
    };

    let outputContent;

    switch (format) {
        case 'array': {
            const routes = await getContentRoutes({...roots, basePath, includeTopLevel});
            outputContent = JSON.stringify(routes, null, 2);
            break;
        }
        case 'objects': {
            const routes = await getContentRouteObjects({...roots, basePath, includeTopLevel});
            outputContent = JSON.stringify(routes, null, 2);
            break;
        }
        case 'urls': {
            const urls = await getContentUrls({...roots, baseUrl, basePath, includeTopLevel});
            outputContent = JSON.stringify(urls, null, 2);
            break;
        }
        case 'xml': {
            outputContent = await getSitemapXml({
                ...roots,
                baseUrl,
                basePath,
                existingSitemapPath: outputPath,
                includeArchives,
                includeLastmod,
                includeTopLevel,
                onlyArchives,
                onlyDiscussions
            });
            break;
        }
        case 'xml-discussions': {
            outputContent = await getSitemapDiscussionsXml({
                ...roots,
                baseUrl,
                basePath,
                existingSitemapPath: outputPath,
                includeLastmod
            });
            break;
        }
        case 'xml-index': {
            outputContent = getSitemapIndexXml({baseUrl});
            break;
        }
        case 'ssg-archive-routes':
        case 'ssg-archive-routes.json': {
            const ssgArchiveRoutes = await getSsgArchiveRoutes(roots);
            outputContent = `${JSON.stringify(ssgArchiveRoutes, null, 4)}\n`;
            break;
        }
        case 'llms':
        case 'llms.txt': {
            outputContent = await getLlmsTxt({...roots, baseUrl, basePath, includeArchives, includeTopLevel});
            break;
        }
        case 'llms-full':
        case 'llms-full.txt': {
            outputContent = await getLlmsFullTxt({baseUrl, basePath});
            break;
        }
        case 'seo-json':
        case 'seo.json': {
            const seoJson = await getSeoJson({
                basePath,
                releaseNotesRoot: roots.releaseNotesRoot
            });
            outputContent = `${JSON.stringify(seoJson, null, 4)}\n`;
            break;
        }
        default:
            throw new Error(`Unsupported format "${format}". Supported formats: array, objects, urls, xml, xml-discussions, xml-index, ssg-archive-routes, llms, llms-full, seo-json.`);
    }

    if (output) {
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, outputContent);
        console.log(`Successfully wrote output to ${output}`);
    } else {
        console.log(outputContent);
    }
}

if (isEntryModule(import.meta.url)) {
    runCli().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

export default {
    assertStableReleaseNoteGithubLinks,
    collectBlogRoutes,
    collectExampleFamilyRoutes,
    collectExampleRoutes,
    extractExampleFamilyDefinitions,
    extractMarkdownSeoMetadata,
    formatLearnSeoTitle,
    getContentRouteObjects,
    getContentRoutes,
    getContentUrls,
    getDisallowedReleaseNoteGithubLinks,
    getExistingSitemapLastmodMap,
    getLatestSitemapLastmod,
    getLlmsFullTxt,
    getLlmsTxt,
    getMaxReleaseMajor,
    getPublishedExampleFamilies,
    getReleaseNotePriority,
    getSeoJson,
    getSitemapDiscussionsXml,
    getSitemapIndexXml,
    getSitemapXml,
    getSsgArchiveRoutes,
    hasReliableGitHistory,
    isIndexableReleaseVersion,
    isRedirectMarkdown,
    resolveLearnTreeLeaves
};
