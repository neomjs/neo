import * as acorn            from 'acorn';
import fg                    from 'fast-glob';
import fs                    from 'fs-extra';
import path                  from 'path';
import semver                from 'semver';
import {readReleaseSeoStamp} from '../../release/releaseNoteFrontmatter.mjs';
import {EXAMPLES_DIR, readExampleCatalog} from '../../util/exampleCatalog.mjs';
import {
    FRONTMATTER_BLOCK_PATTERN, chunkArray, extractFrontmatterDateOnly, formatLastmodDate, getChangedGitPaths,
    getChangedLastmod, getGitLastModifiedBatch, getGitLastmodDateMap, getGitPath, hasReliableGitHistory,
    lookupNewestGitDate, normalizeIsoDateOnly
} from './gitLastmod.mjs';
import {findUnlistedLearnMarkdownFiles} from './learnSpokes.mjs';

export {
    chunkArray, extractFrontmatterDateOnly, findUnlistedLearnMarkdownFiles, formatLastmodDate,
    getChangedGitPaths, getChangedLastmod, getGitLastModifiedBatch, getGitLastmodDateMap, getGitPath,
    hasReliableGitHistory, normalizeIsoDateOnly
};

/**
 * @module buildScripts.docs.seo.seoJson
 * @summary Extracts route-specific SEO titles, descriptions, `robots` directives, and batched git `lastmod`
 * dates from Markdown and Portal sources to build `apps/portal/resources/data/seo.json` while preserving
 * curated top-level entries and pre-baked `lastmod` fallbacks when `.git` history is unavailable.
 */

const ROOT_DIR          = process.cwd();
const DEFAULT_BASE_PATH = '/learn';

/**
 * Source-file dependencies for curated top-level Portal and News hub routes so `seo.json` and
 * `sitemap-core.xml` derive identical git-backed `lastmod` dates.
 * @type {Object<String, String|String[]>}
 */
export const TOP_LEVEL_SOURCE_PATHS = {
    '/'                : ['apps/portal/index.html', 'apps/portal/view/home/MainContainer.mjs'],
    '/about-us'        : 'apps/portal/view/about/Container.mjs',
    '/docs'            : 'apps/portal/view/ViewportController.mjs',
    '/examples'        : EXAMPLES_DIR,
    '/home'            : ['apps/portal/index.html', 'apps/portal/view/home/MainContainer.mjs'],
    '/learn'           : 'learn/tree.json',
    '/news'            : 'apps/portal/view/news/TabContainer.mjs',
    '/news/blog'       : ['apps/portal/resources/data/blog.json', 'apps/portal/view/news/blog/MainContainer.mjs'],
    '/news/discussions': 'apps/portal/view/news/discussions/MainContainer.mjs',
    '/news/medium'     : ['apps/portal/resources/data/medium_blog.json', 'apps/portal/view/news/medium/Container.mjs'],
    '/news/pulls'      : 'apps/portal/view/news/pulls/MainContainer.mjs',
    '/news/releases'   : ['apps/portal/resources/data/releases.json', 'apps/portal/view/news/release/MainContainer.mjs'],
    '/news/tickets'    : 'apps/portal/view/news/tickets/MainContainer.mjs',
    '/news/videos'     : ['apps/portal/resources/data/videos.json', 'apps/portal/view/news/videos/Container.mjs'],
    '/services'        : 'apps/portal/view/services/Container.mjs'
};

/**
 * Standalone entrypoints omitted from `sitemap-core.xml`, `seo.json`, and `llms.txt`.
 * @type {Set<String>}
 */
export const NON_INDEXABLE_STANDALONE_PATHS = new Set([
    'apps/portal/index.html',
    'apps/ai/neural-link/index.html',
    'examples/dashboard/crossWindowWitness/index.html'
]);

/**
 * @summary Extracts a single-line scalar YAML frontmatter field (`seoTitle`, `seoDescription`, etc.),
 * unwrapping single- or double-quoted strings and unescaping embedded quotes.
 * @param {String} [rawContent='']
 * @param {String} [field='']
 * @returns {String|null}
 */
export function extractFrontmatterField(rawContent='', field='') {
    const frontmatter = FRONTMATTER_BLOCK_PATTERN.exec(String(rawContent))?.[1];

    if (!frontmatter || !field) {
        return null;
    }

    const escapedField = String(field).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match        = new RegExp(`^${escapedField}:\\s*(.+?)\\s*$`, 'm').exec(frontmatter);

    if (!match) {
        return null;
    }

    let value = match[1].trim();

    if (!value) {
        return null;
    }

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        value = value.slice(1, -1).replace(/\\(["\\])/g, '$1').trim();
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
        value = value.slice(1, -1).replace(/''/g, "'").replace(/\\'/g, "'").trim();
    }

    return value || null;
}

/**
 * @summary Extracts `<title>` and `<meta name="description">` metadata from `apps/portal/index.html`
 * so `seo.json['/']` and `seo.json['/home']` derive directly from the canonical Portal HTML shell at build time.
 * @param {String} [htmlContent='']
 * @returns {{title: String, description: String}|null}
 */
export function extractPortalIndexMetadata(htmlContent='') {
    const html     = String(htmlContent);
    const rawTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const title    = rawTitle ? rawTitle.replace(/\s+/g, ' ').trim() : '';

    if (!title) {
        return null;
    }

    let description = '';

    for (const [metaTag] of html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
        if (/\bname\s*=\s*(["'])\s*description\s*\1/i.test(metaTag)) {
            const rawDescription = /\bcontent\s*=\s*(["'])([\s\S]*?)\1/i.exec(metaTag)?.[2];

            if (rawDescription) {
                description = rawDescription.replace(/\s+/g, ' ').trim();
                if (description) {
                    break;
                }
            }
        }
    }

    if (!description) {
        return null;
    }

    return {title, description};
}

/**
 * @summary Checks whether a Markdown document declares `type: redirect` in its YAML frontmatter
 * (such as moved-ADR pointer stubs).
 * @param {String} [rawContent='']
 * @returns {Boolean}
 */
export function isRedirectMarkdown(rawContent='') {
    const frontmatter = FRONTMATTER_BLOCK_PATTERN.exec(String(rawContent))?.[1];

    if (!frontmatter) {
        return false;
    }

    return /^type:\s*["']?redirect["']?\s*$/im.test(frontmatter);
}

/**
 * @summary Computes the highest semver major across a list of release version strings.
 * @param {String[]} [versions=[]]
 * @returns {Number|null}
 */
export function getMaxReleaseMajor(versions=[]) {
    let maxMajor = null;

    for (const version of versions) {
        const major = semver.coerce(version)?.major;

        if (major != null && (maxMajor === null || major > maxMajor)) {
            maxMajor = major;
        }
    }

    return maxMajor;
}

/**
 * @summary Normalizes a release tag for comparisons while retaining prerelease and build metadata.
 * @param {String} version
 * @returns {String}
 */
function releaseVersionKey(version) {
    return String(version ?? '').trim().replace(/^v/, '')
}

/** @member {Number} INDEXABLE_RELEASE_LIMIT=25 */
export const INDEXABLE_RELEASE_LIMIT = 25;

/**
 * @summary Selects the latest distinct SemVer releases eligible for indexing.
 * @param {String[]} versions Versions from release notes and the release index
 * @returns {Set<String>}
 */
export function getIndexableReleaseVersions(versions=[]) {
    const distinct = new Set(versions.map(releaseVersionKey).filter(version => semver.valid(version)));

    return new Set([...distinct].sort((a, b) => semver.compareBuild(b, a)).slice(0, INDEXABLE_RELEASE_LIMIT))
}

/**
 * @summary Checks whether a release-note version belongs to the shared indexable window.
 * @param {String} version
 * @param {Set<String>} indexableVersions
 * @returns {Boolean}
 */
export function isIndexableReleaseVersion(version, indexableVersions) {
    return indexableVersions.has(releaseVersionKey(version))
}

/**
 * @summary Reads release leaf records from the Portal index, including metadata-only releases.
 * @param {String} releasesPath
 * @returns {Promise<Object[]>}
 */
export async function readReleaseIndex(releasesPath) {
    if (!(await fs.pathExists(releasesPath))) return [];

    const index = await fs.readJSON(releasesPath),
          nodes = Array.isArray(index) ? index : index?.data;

    return Array.isArray(nodes) ? nodes.filter(node => node?.id && node.isLeaf !== false) : []
}

/**
 * @summary Repeatedly applies a regex replacement until the output stabilizes so nested
 * multi-character sequences cannot survive a single pass.
 * @param {String} text
 * @param {RegExp} pattern
 * @param {String} [replacement='']
 * @returns {String}
 */
function replaceUntilStable(text='', pattern, replacement='') {
    let current = String(text),
        previous;

    do {
        previous = current;
        current  = current.replace(pattern, replacement);
    } while (current !== previous);

    return current;
}

/**
 * @summary Cleans inline Markdown formatting (links, code, emphasis, HTML tags) from a text snippet.
 * @param {String} text
 * @returns {String}
 */
function stripInlineMarkdown(text='') {
    const withoutMarkdown = String(text)
        .replace(/^@summary\s+/i, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1');

    return replaceUntilStable(withoutMarkdown, /<[^>]+>/g, '')
        .replace(/[<>]/g, '')
        .replace(/(\*\*|__|\*|_)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @summary Truncates a description string at a word boundary to at most `maxLength` characters.
 * @param {String} text
 * @param {Number} [maxLength=160]
 * @returns {String}
 */
function truncateDescription(text='', maxLength=160) {
    const clean = text.trim();

    if (clean.length <= maxLength) {
        return clean;
    }

    const slice     = clean.slice(0, maxLength - 3);
    const lastSpace = slice.lastIndexOf(' ');

    return `${(lastSpace > 80 ? slice.slice(0, lastSpace) : slice).replace(/[.,;:—–-\s]+$/, '')}...`;
}

/**
 * @summary Enriches `/learn/*` headings with developer search-intent context when the raw `<h1>`
 * heading is generic or lacks category qualifiers, falling back to `baseTitle` + `suffix` when
 * `baseTitle` does not already mention `Neo.mjs`.
 * @param {String} [baseTitle='']
 * @param {String} [route='']
 * @param {String} [suffix=' - Neo.mjs']
 * @param {String} [basePath=DEFAULT_BASE_PATH]
 * @returns {String}
 */
export function formatLearnSeoTitle(baseTitle='', route='', suffix=' - Neo.mjs', basePath=DEFAULT_BASE_PATH) {
    const cleanTitle      = String(baseTitle || '').trim();
    const normalizedRoute = String(route || '').trim();
    const normalizedBase  = String(basePath || DEFAULT_BASE_PATH).startsWith('/')
        ? String(basePath || DEFAULT_BASE_PATH)
        : `/${basePath}`;
    const cleanBase    = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const isLearnRoute = normalizedRoute.startsWith(`${cleanBase}/`) || normalizedRoute.startsWith('/learn/');
    const relId        = normalizedRoute.startsWith(`${cleanBase}/`)
        ? normalizedRoute.slice(cleanBase.length + 1)
        : normalizedRoute.startsWith('/learn/')
            ? normalizedRoute.slice('/learn/'.length)
            : '';

    if (/^comparisons\/overview$/i.test(relId)) {
        return 'Neo.mjs vs React, Angular, Vue & Solid: Application Engine vs JavaScript Frameworks | Neo.mjs';
    }

    if (cleanTitle && cleanTitle.toLowerCase() !== 'neo.mjs' && isLearnRoute) {
        if (/\|\s*Neo\.mjs$/i.test(cleanTitle)) {
            return cleanTitle;
        }

        const hasDashQualifier = /(?:\s(?:—|--|-)\s|:\s)/.test(cleanTitle);
        const mentionsNeo      = /neo\.?mjs/i.test(cleanTitle);
        const hasCategoryNoun  = /application\s+engine/i.test(cleanTitle);

        if (/^comparisons\//i.test(relId) && !hasDashQualifier && cleanTitle.length < 45) {
            return `${cleanTitle} — Multi-Threaded JavaScript UI Comparison | Neo.mjs`;
        }

        if (!mentionsNeo && !hasDashQualifier && !hasCategoryNoun && cleanTitle.length < 45) {
            if (/^benefits\/body\//i.test(relId)) {
                return `${cleanTitle} — Multi-Threaded JavaScript Application Engine | Neo.mjs`;
            }
            if (/^(?:benefits|agentos)\//i.test(relId)) {
                return `${cleanTitle} — AI Agent OS & Multi-Threaded Application Engine | Neo.mjs`;
            }
            if (/^institution\//i.test(relId)) {
                return `${cleanTitle} — AI Agent Institution & Fleet Cockpit | Neo.mjs`;
            }
            if (/^guides\//i.test(relId)) {
                return `${cleanTitle} — Neo.mjs Developer Guide`;
            }
            if (/^tutorials\//i.test(relId)) {
                return `${cleanTitle} — Neo.mjs Tutorial | Neo.mjs`;
            }
            return `${cleanTitle} — Multi-Threaded JavaScript Application Engine | Neo.mjs`;
        }
    }

    return /neo\.mjs/i.test(cleanTitle) ? cleanTitle : `${cleanTitle}${suffix}`;
}

/** @summary A block opening with a bold page-metadata field (`**Release Type:**`) is a page's header, not its summary. */
const PAGE_METADATA_FIELD = /^\*\*(?:release type|stability|breaking changes|upgrade path|pre-?requisites?|target audience)(?::\*\*|\*\*:)/i;

/**
 * @summary Extracts a route-specific `title` and `description` from a Markdown document, honoring explicit
 * YAML frontmatter `seoTitle` and `seoDescription` overrides before falling back to `<h1>` and body prose.
 * Body prose starts after any `PAGE_METADATA_FIELD` blocks, and a leading `TL;DR:` label is dropped.
 * @param {String} rawContent
 * @param {Object} [options={}]
 * @param {String} [options.basePath=DEFAULT_BASE_PATH]
 * @param {String} [options.fallbackDescription='Learn the fundamentals of the Neo.mjs platform.']
 * @param {String} [options.fallbackTitle='Neo.mjs']
 * @param {String} [options.route='']
 * @param {String} [options.suffix=' - Neo.mjs']
 * @returns {{title: String, description: String}}
 */
export function extractMarkdownSeoMetadata(rawContent='', options={}) {
    const {
        basePath            = DEFAULT_BASE_PATH,
        fallbackDescription = 'Learn the fundamentals of the Neo.mjs platform.',
        fallbackTitle       = 'Neo.mjs',
        route               = '',
        suffix              = ' - Neo.mjs'
    } = options;

    const rawSeoTitle       = extractFrontmatterField(rawContent, 'seoTitle');
    const cleanSeoTitle     = rawSeoTitle ? stripInlineMarkdown(rawSeoTitle) : '';
    const rawSeoDescription = extractFrontmatterField(rawContent, 'seoDescription');
    const cleanSeoDesc      = rawSeoDescription ? stripInlineMarkdown(rawSeoDescription) : '';

    const withoutFrontmatter = String(rawContent).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const withoutCodeBlocks  = withoutFrontmatter.replace(/```[\s\S]*?```/g, '');
    const withoutComments    = replaceUntilStable(withoutCodeBlocks, /<!--[\s\S]*?-->/g, '');
    const withoutBlocks      = replaceUntilStable(withoutComments, /<details[\s\S]*?<\/details>/gi, '');

    let title;

    if (cleanSeoTitle) {
        title = /neo\.mjs/i.test(cleanSeoTitle) ? cleanSeoTitle : `${cleanSeoTitle}${suffix}`;
    } else {
        const h1Match   = withoutBlocks.match(/^#\s+(.+)$/m);
        const baseTitle = stripInlineMarkdown(h1Match ? h1Match[1] : fallbackTitle) || fallbackTitle;

        title = formatLearnSeoTitle(baseTitle, route, suffix, basePath);
    }

    if (cleanSeoDesc) {
        return {
            title,
            description: truncateDescription(cleanSeoDesc, 160)
        };
    }

    const withoutHeadings = withoutBlocks.replace(/^#+\s+.*$/gm, '');
    const blocks          = withoutHeadings
        .split(/\r?\n\s*\r?\n/)
        .map(block => block.trim())
        .filter(Boolean);

    let description       = '',
        quoteFallbackDesc = '';

    for (const block of blocks) {
        if (
            /^(?:---+|\*\*\*+|___+)$/.test(block) ||
            /^<[^>]+>/.test(block) ||
            /^\|/.test(block) ||
            /^!\[/.test(block) ||
            /^\*(?:Written by|Cover of)\b/i.test(block) ||
            /^\*\*\[▶/.test(block) ||
            /^todo:/i.test(block) ||
            PAGE_METADATA_FIELD.test(block)
        ) {
            continue;
        }

        const isBlockquote = /^>/.test(block);
        const unwrapped    = block
            .split(/\r?\n/)
            .map(line => line.replace(/^>\s?/, '').replace(/^[-*]\s+/, ''))
            .join(' ');
        const cleaned = stripInlineMarkdown(unwrapped);

        if (cleaned.length < 35) {
            continue;
        }

        if (isBlockquote && !/^tl;dr\b/i.test(cleaned)) {
            if (!quoteFallbackDesc) {
                quoteFallbackDesc = truncateDescription(cleaned, 160);
            }
            continue;
        }

        description = truncateDescription(cleaned.replace(/^tl;dr:\s*/i, ''), 160);
        break;
    }

    return {
        title,
        description: description || quoteFallbackDesc || truncateDescription(stripInlineMarkdown(fallbackDescription), 160)
    };
}

/**
 * @summary Extracts the `familyDefinitions` config array from `apps/portal/view/examples/MainContainer.mjs`
 * via AST parsing so `MainContainer.mjs` remains the single source of truth without booting the UI runtime.
 * Throws when `familyDefinitions` is missing, non-array, or contains non-literal/incomplete entries.
 * @param {String} [source='']
 * @returns {Array<{family: String|null, title: String, route: String}>}
 */
export function extractExampleFamilyDefinitions(source='') {
    if (!source || typeof source !== 'string') {
        throw new Error('Failed to extract familyDefinitions from MainContainer.mjs: source must be a non-empty string.');
    }

    const ast           = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
    const definitions   = [];
    let   foundProperty = false;

    function walk(node) {
        if (!node || typeof node !== 'object') {
            return;
        }

        const keyName = node.key?.name ?? node.key?.value;

        if (
            (node.type === 'Property' || node.type === 'PropertyDefinition') &&
            keyName === 'familyDefinitions'
        ) {
            foundProperty = true;

            if (node.value?.type !== 'ArrayExpression') {
                throw new Error('Invalid familyDefinitions in MainContainer.mjs: expected an ArrayExpression.');
            }

            for (const element of node.value.elements) {
                if (element?.type !== 'ObjectExpression') {
                    throw new Error('Invalid familyDefinitions entry in MainContainer.mjs: expected an ObjectExpression.');
                }

                const entry = {};

                for (const prop of element.properties) {
                    if (prop?.type !== 'Property') {
                        throw new Error('Invalid familyDefinitions property in MainContainer.mjs: expected a Property.');
                    }

                    const propKey = prop.key?.name ?? prop.key?.value;

                    if (!propKey || prop.value?.type !== 'Literal') {
                        throw new Error(`Invalid familyDefinitions property "${propKey || 'unknown'}" in MainContainer.mjs: expected a Literal value.`);
                    }

                    entry[propKey] = prop.value.value;
                }

                const hasValidFamily = entry.family === null || (typeof entry.family === 'string' && entry.family.length > 0);
                const hasValidRoute  = typeof entry.route === 'string' && entry.route.startsWith('/examples');
                const hasValidTitle  = typeof entry.title === 'string' && entry.title.length > 0;

                if (!hasValidFamily || !hasValidRoute || !hasValidTitle) {
                    throw new Error('Incomplete familyDefinitions entry in MainContainer.mjs: each entry requires literal family, route, and title.');
                }

                definitions.push({
                    family: entry.family,
                    route : entry.route,
                    title : entry.title
                });
            }

            return;
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach(walk);
            } else if (value && typeof value.type === 'string') {
                walk(value);
            }
        }
    }

    walk(ast);

    if (!foundProperty || definitions.length === 0) {
        throw new Error('Failed to extract familyDefinitions from MainContainer.mjs: no definitions found.');
    }

    return definitions;
}

/**
 * @summary Search-intent wording per example family, keyed by `familyDefinitions` `family`.
 * `title` is the route's `<title>` (at most 68 characters): what a reader searches for, and the capability that sets
 * the family apart. `subject` is the plain-English noun its description counts. `Portal.service.Seo#routeTitles`
 * repeats each title as the SPA window title.
 * @type {Object<String, {subject: String, title: String}>}
 */
export const EXAMPLE_FAMILY_SEO = {
    apps          : {subject: 'JavaScript web app',              title: 'JavaScript Web App Examples — Full Apps on Worker Threads | Neo.mjs'},
    board         : {subject: 'JavaScript task and kanban board', title: 'JavaScript Task & Kanban Board — Swimlanes & Cards | Neo.mjs'},
    buttons       : {subject: 'JavaScript button and menu',      title: 'JavaScript Buttons, Menus & Toolbars — Live Examples | Neo.mjs'},
    calendar      : {subject: 'JavaScript calendar',             title: 'MIT JavaScript Calendar — Day, Week, Month & Year Views | Neo.mjs'},
    charts        : {subject: 'JavaScript chart and canvas',     title: 'JavaScript Charts, Canvas & Maps — OffscreenCanvas Demos | Neo.mjs'},
    components    : {subject: 'JavaScript UI component',         title: 'JavaScript UI Component Examples — Off the Main Thread | Neo.mjs'},
    dashboard     : {subject: 'JavaScript dashboard',            title: 'JavaScript Dashboard & Docking — Panes That Pop Out | Neo.mjs'},
    dialogs       : {subject: 'JavaScript dialog',               title: 'JavaScript Dialogs & Overlays — Live Examples | Neo.mjs'},
    'drag-drop'   : {subject: 'JavaScript drag and drop',        title: 'JavaScript Drag & Drop Examples — Boards, Lists & Panes | Neo.mjs'},
    forms         : {subject: 'JavaScript form',                 title: 'JavaScript Form Examples — Fields, Pickers & Validation | Neo.mjs'},
    functional    : {subject: 'JavaScript functional component', title: 'JavaScript Functional Component Examples | Neo.mjs'},
    gantt         : {subject: 'JavaScript Gantt chart',          title: 'MIT JavaScript Gantt Chart — Linked, Editable Tasks | Neo.mjs'},
    'grid-table'  : {subject: 'JavaScript data grid',            title: 'JavaScript Data Grid Examples — 100k Rows in a Web Worker | Neo.mjs'},
    layouts       : {subject: 'JavaScript layout',               title: 'JavaScript Containers & Layouts — Flexbox, Card & Form | Neo.mjs'},
    lists         : {subject: 'JavaScript list and gallery',     title: 'JavaScript Lists & Galleries — 3D Helix & Gallery Views | Neo.mjs'},
    'multi-window': {subject: 'multi-window JavaScript app',     title: 'Multi-Window JavaScript App Examples — SharedWorker State | Neo.mjs'},
    platform      : {subject: 'JavaScript web worker',           title: 'JavaScript Web Worker Examples — Workers & Platform | Neo.mjs'},
    scheduler     : {subject: 'JavaScript resource scheduler',   title: 'MIT JavaScript Resource Scheduler — Editable Timeline | Neo.mjs'},
    state         : {subject: 'JavaScript state management',     title: 'JavaScript State Management Examples — Reactive Stores | Neo.mjs'},
    tabs          : {subject: 'JavaScript tabs',                 title: 'JavaScript Tabs — Reorderable Tab Bars & Overflow | Neo.mjs'},
    tree          : {subject: 'JavaScript tree and tree grid',   title: 'JavaScript Trees — Tree Grids, Lists & Accordions | Neo.mjs'}
};

/**
 * @summary Returns a family's search wording from {@link EXAMPLE_FAMILY_SEO}, or a plain fallback built from its
 * tab title for a family that has none yet.
 * @param {{family: String, title: String}} definition A `familyDefinitions` entry
 * @returns {{subject: String, title: String}}
 */
export function getExampleFamilySeo({family, title}) {
    return EXAMPLE_FAMILY_SEO[family] || {subject: `JavaScript ${title}`, title: `JavaScript ${title} Examples | Neo.mjs`}
}

/**
 * @summary Builds a concise SEO description for a published `/examples/<family>` overview route
 * from its covered catalog records, keeping only complete highlights that fit within 160 characters.
 * @param {String} subject The family's plain-English noun, e.g. 'JavaScript data grid'
 * @param {Object[]} [records=[]]
 * @returns {String}
 */
function formatExampleFamilyDescription(subject='', records=[]) {
    const count      = records.length;
    const prefix     = `Explore ${count} live ${subject} ${count === 1 ? 'example' : 'examples'}`;
    const candidates = records
        .map(record => stripInlineMarkdown(record?.feature || record?.name || '').replace(/\.+$/, ''))
        .filter(Boolean)
        .slice(0, 3);
    const highlights = [];

    for (const item of candidates) {
        const next = `${prefix}: ${[...highlights, item].join('; ')}.`;

        if (next.length <= 160 || highlights.length === 0) {
            highlights.push(item);
        } else {
            break;
        }
    }

    const summary = highlights.length > 0
        ? `: ${highlights.join('; ')}.`
        : '.';

    return truncateDescription(`${prefix}${summary}`, 160);
}

/**
 * @summary Returns the ordered example groups (`family !== null`) from `apps/portal/view/examples/MainContainer.mjs`
 * that have at least one member in the catalog (`EXAMPLES_DIR`) publishing a card in production, each with those
 * members: a group publishes its search route once its overview has a card to show there.
 *
 * A member is a record whose home `family` is the group or whose `alsoIn` names it. A card publishes in production
 * when the record names a cover and production can open it, the rule of `Portal.model.Example.publishes()` for
 * `dist_prod`, which this build script cannot import. `MainContainerController.spec.mjs` holds the two to one result.
 * @param {Object} [options={}]
 * @param {String} [options.examplesDir] The catalog folder
 * @param {String} [options.examplesMainContainerPath]
 * @param {Array<{family: String|null, title: String, route: String}>} [options.familyDefinitions]
 * @param {String} [options.root=ROOT_DIR]
 * @returns {Promise<Array<{family: String, filePath: String, records: Object[], route: String, title: String}>>}
 */
export async function getPublishedExampleFamilies(options={}) {
    const {
        root                     = ROOT_DIR,
        examplesDir              = path.resolve(root, EXAMPLES_DIR),
        examplesMainContainerPath = path.resolve(root, 'apps/portal/view/examples/MainContainer.mjs'),
        familyDefinitions
    } = options;

    if (!(await fs.pathExists(path.join(examplesDir, 'index.json')))) {
        return [];
    }

    const definitions = Array.isArray(familyDefinitions)
        ? familyDefinitions
        : extractExampleFamilyDefinitions(await fs.readFile(examplesMainContainerPath, 'utf-8'));

    const records = (await readExampleCatalog(examplesDir)).records
        .filter(record => record?.image && !record.hidden && !record.hiddenIn?.includes('dist_prod') && record.urls?.dist_prod);

    return definitions
        .filter(definition => definition?.family && definition?.route)
        .map(definition => ({
            ...definition,
            filePath: examplesDir,
            records : records.filter(record => record.family === definition.family || record.alsoIn?.includes(definition.family))
        }))
        .filter(definition => definition.records.length > 0);
}

/**
 * @summary Collects populated `/examples/<family>` overview routes from
 * `apps/portal/view/examples/MainContainer.mjs` (`familyDefinitions`) and the catalog (`EXAMPLES_DIR`).
 * @param {Object} [options={}]
 * @returns {Promise<Array<{category: String, filePath: String, id: String, name: String}>>}
 */
export async function collectExampleFamilyRoutes(options={}) {
    const families = await getPublishedExampleFamilies(options);

    return families.map(family => ({
        category: 'example-family',
        filePath: family.filePath,
        id      : family.route,
        name    : `${family.title} Examples`
    }));
}

/**
 * @summary Derives a human-readable fallback title from an app or example path
 * (e.g., `'examples/grid/bigData/index.html'` -> `'Big Data'`).
 * @param {String} examplePath
 * @returns {String}
 */
function getNameFromExamplePath(examplePath) {
    const parts = examplePath.split('/').slice(1, -1);
    const name  = parts[parts.length - 1];

    return name.replace(/([A-Z])/g, ' $1')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * @summary Builds `title` and `description` metadata for a standalone app or example `index.html` route,
 * preserving already-qualified `| Neo.mjs` HTML titles while enriching bare names from the catalog.
 * @param {Object} exampleRoute
 * @param {Object|null} [catalogRecord=null]
 * @returns {{title: String, description: String}}
 */
export function formatStandaloneExampleSeo(exampleRoute, catalogRecord=null) {
    const rawTitle  = String(exampleRoute?.name || '').trim();
    const fallback  = getNameFromExamplePath(String(exampleRoute?.id || '').replace(/^\/+/, ''));
    const baseName  = rawTitle || (catalogRecord?.name ? String(catalogRecord.name).trim() : '') || fallback;
    const baseLabel = baseName
        .replace(/\s*[—|-]\s*Living Docking Showcase$/i, '')
        .replace(/^Neo(?:\.mjs)?(?:\s*[-—–·:]\s*|\s+)/i, '')
        .trim() || fallback;

    let title;

    if (/\|\s*Neo\.mjs\s*$/i.test(rawTitle)) {
        title = rawTitle;
    } else {
        const routeId    = String(exampleRoute?.id || '');
        const qualifiers = (catalogRecord?.sharedWorkers || /multiWindow|shared|crossWindow|tearOut|dock/i.test(routeId))
            ? ['Multi-Window JavaScript Demo | Neo.mjs', 'Multi-Window Demo | Neo.mjs', 'Live Demo | Neo.mjs']
            : /^\/examples\/(?:grid|table)/i.test(routeId)
                ? ['Web Worker Data Grid Demo | Neo.mjs', 'Data Grid Demo | Neo.mjs', 'Live Demo | Neo.mjs']
                : /^\/apps\//i.test(routeId)
                    ? ['Multi-Threaded JavaScript App | Neo.mjs', 'JavaScript App | Neo.mjs', 'Live App | Neo.mjs']
                    : ['Web Worker JavaScript UI Demo | Neo.mjs', 'JavaScript UI Demo | Neo.mjs', 'Live Demo | Neo.mjs'];

        title = `${truncateDescription(baseLabel, 58)} | Neo.mjs`;

        for (const qualifier of qualifiers) {
            const candidate = `${baseLabel} — ${qualifier}`;

            if (candidate.length <= 68) {
                title = candidate;
                break;
            }
        }
    }

    let description;

    if (exampleRoute?.description) {
        description = truncateDescription(exampleRoute.description, 160);
    } else if (catalogRecord?.feature) {
        const feature = String(catalogRecord.feature).trim().replace(/\.+$/, '');
        const detail  = catalogRecord?.lookFor ? String(catalogRecord.lookFor).trim() : 'Runs off the main thread in Neo.mjs Web Workers.';
        description   = truncateDescription(`${feature}. ${detail}`, 160);
    } else {
        const kind = /^\/apps\//i.test(String(exampleRoute?.id || '')) ? 'app' : 'example';
        description = truncateDescription(
            `Live runnable ${baseLabel} ${kind} in Neo.mjs, the multi-threaded JavaScript application engine running UI components and state in Web Workers.`,
            160
        );
    }

    return {description, title};
}

/**
 * @summary Collects standalone app and example `index.html` routes under `apps/` and `examples/`,
 * excluding non-indexable harnesses (`NON_INDEXABLE_STANDALONE_PATHS`, `seo: false` configs, and popup childapps).
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Promise<Array<{category: String, description: (String|null), filePath: String, id: String, name: String, sourceTitle: String}>>}
 */
export async function collectExampleRoutes(root=ROOT_DIR) {
    let files = await fg('{apps,examples}/**/index.html', {
        cwd   : root,
        ignore: ['**/node_modules/**']
    });

    files = files.filter(file =>
        !NON_INDEXABLE_STANDALONE_PATHS.has(file) &&
        !/(?:^|\/)childapps?(?:\/|$)/.test(file)
    );

    files.sort((a, b) => a.localeCompare(b));

    const routes = await Promise.all(files.map(async file => {
        const filePath      = path.resolve(root, file);
        const neoConfigPath = path.join(path.dirname(filePath), 'neo-config.json');

        if (await fs.pathExists(neoConfigPath)) {
            try {
                const neoConfig = await fs.readJSON(neoConfigPath);

                if (neoConfig?.seo === false || neoConfig?.excludeFromSitemap === true) {
                    return null;
                }
            } catch {
                // Ignore malformed config fixtures when reading optional SEO opt-out flags.
            }
        }

        const content    = await fs.readFile(filePath, 'utf-8');
        const portalMeta = extractPortalIndexMetadata(content);
        const rawTitle   = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1]?.replace(/\s+/g, ' ').trim();

        return {
            category   : 'file',
            description: portalMeta?.description || null,
            filePath,
            id         : `/${file}`,
            name       : portalMeta?.title || rawTitle || getNameFromExamplePath(file),
            sourceTitle: rawTitle || ''
        };
    }));

    return routes.filter(Boolean);
}

/**
 * @summary Reads `tree.json` and resolves every content leaf (`isLeaf !== false && !node.route`)
 * to its `learn/<id>.md` file on disk, failing closed when a leaf markdown file is missing.
 * Redirect leaves carrying an explicit `node.route` (e.g. `ApiDocs -> /docs`) are intentionally skipped.
 * @param {Object} [options={}]
 * @param {String} [options.learnDir]
 * @param {String} [options.root=ROOT_DIR]
 * @param {String} [options.treeFilePath]
 * @returns {Promise<Array<{filePath: String, hidden: Boolean, id: String, name: (String|undefined), node: Object}>>}
 */
export async function resolveLearnTreeLeaves(options={}) {
    const {
        root         = ROOT_DIR,
        learnDir     = path.resolve(root, 'learn'),
        treeFilePath = path.join(learnDir, 'tree.json')
    } = options;

    const tree  = await fs.readJSON(treeFilePath);
    const nodes = (Array.isArray(tree) ? tree : Array.isArray(tree?.data) ? tree.data : [])
        .filter(node => node?.id && node.isLeaf !== false && !node.route);
    const leaves = [];

    for (const node of nodes) {
        const filePath = path.join(learnDir, `${node.id}.md`);

        if (!(await fs.pathExists(filePath))) {
            throw new Error(`Learn tree leaf "${node.id}" has no markdown file at "${filePath}".`);
        }

        leaves.push({
            filePath,
            hidden: Boolean(node.hidden),
            id    : node.id,
            name  : node.name,
            node
        });
    }

    return leaves;
}

/**
 * @summary Generates the route-keyed SEO metadata map (`apps/portal/resources/data/seo.json`) covering
 * curated top-level routes (including both `'/'` and `'/home'`), `learn/tree.json` leaves (`/learn/*`),
 * `blog.json` leaves (`/news/blog/*`), release-note leaves (`/news/releases/*`), and populated
 * `/examples/<family>` overview routes, baking batched git `lastmod` (`YYYY-MM-DD`) dates and marking
 * hidden/redirect learn leaves and releases outside the latest SemVer window with `robots: 'noindex, follow'`.
 * @param {Object} [options={}]
 * @param {String} [options.basePath='/learn']
 * @param {String} [options.blogIndexPath]
 * @param {String} [options.examplesDir] The catalog folder
 * @param {String} [options.examplesMainContainerPath]
 * @param {Array<{family: (String|null), title: String, route: String, iconCls: (String|undefined)}>} [options.familyDefinitions]
 * @param {String} [options.learnDir]
 * @param {String} [options.pendingReleaseNote] Stamped note whose sources are about to be committed.
 * @param {String} [options.releaseNotesRoot]
 * @param {String} [options.releasesPath]
 * @param {String} [options.root=ROOT_DIR]
 * @param {String} [options.seoJsonPath]
 * @param {String} [options.treeFilePath]
 * @returns {Promise<Object<String, {title: String, description: String, lastmod?: String, robots?: String, schemaType?: String}>>}
 */
export async function getSeoJson(options={}) {
    const {
        basePath                 = DEFAULT_BASE_PATH,
        root                     = ROOT_DIR,
        learnDir                 = path.resolve(root, 'learn'),
        treeFilePath             = path.join(learnDir, 'tree.json'),
        blogIndexPath            = path.resolve(root, 'apps/portal/resources/data/blog.json'),
        examplesDir              = path.resolve(root, EXAMPLES_DIR),
        examplesMainContainerPath,
        familyDefinitions,
        pendingReleaseNote,
        releasesPath             = path.resolve(root, 'apps/portal/resources/data/releases.json'),
        releaseNotesRoot         = path.resolve(root, '.github/RELEASE_NOTES'),
        seoJsonPath              = path.resolve(root, 'apps/portal/resources/data/seo.json')
    } = options;

    const normalizedBase     = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const cleanBase          = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const gitHistoryReliable = hasReliableGitHistory(root);
    const gitDateMap         = gitHistoryReliable
        ? getGitLastmodDateMap(['learn', 'apps', 'examples', learnDir, releaseNotesRoot], root, releaseNotesRoot)
        : new Map();
    const seo         = {};
    let   existingSeo = {};

    if (pendingReleaseNote) {
        const stamp = readReleaseSeoStamp(await fs.readFile(pendingReleaseNote, 'utf8'));
        if (!stamp) throw new Error(`Missing SEO source dates in ${pendingReleaseNote}`);

        stamp.paths.forEach(file => gitDateMap.set(file, stamp.date))
    }

    // The Portal directory can be a family source. A generated catalog should not date its own route.
    gitDateMap.delete(getGitPath(seoJsonPath, root));

    /**
     * @param {String} route
     * @returns {String|null}
     */
    function getExistingRouteLastmod(route) {
        if (route === '/' || route === '/home') {
            return normalizeIsoDateOnly(existingSeo['/']?.lastmod) ||
                normalizeIsoDateOnly(existingSeo['/home']?.lastmod) ||
                null;
        }

        return normalizeIsoDateOnly(existingSeo[route]?.lastmod);
    }

    /**
     * @param {String} route
     * @param {String[]} [candidatePaths=[]]
     * @param {String|null} [fallbackDate=null]
     * @returns {String|null}
     */
    function resolveRouteLastmod(route, candidatePaths=[], fallbackDate=null) {
        const sourceDate = lookupNewestGitDate(gitDateMap, candidatePaths, root);
        if (sourceDate) return sourceDate;

        if (gitHistoryReliable) {
            return normalizeIsoDateOnly(fallbackDate) || getExistingRouteLastmod(route);
        }

        return getExistingRouteLastmod(route) || normalizeIsoDateOnly(fallbackDate);
    }

    const portalIndexPath = path.resolve(root, 'apps/portal/index.html');
    const portalIndexMeta = (await fs.pathExists(portalIndexPath))
        ? extractPortalIndexMetadata(await fs.readFile(portalIndexPath, 'utf-8'))
        : null;

    if (await fs.pathExists(seoJsonPath)) {
        existingSeo = (await fs.readJSON(seoJsonPath)) || {};
    }

    const homeTemplate = existingSeo['/'] || existingSeo['/home'];
    const homeSource   = portalIndexMeta || homeTemplate;

    if (homeSource) {
        seo['/'] = {
            title      : homeSource.title,
            description: homeSource.description,
            ...(homeTemplate?.schemaType && {schemaType: homeTemplate.schemaType}),
            ...(homeTemplate?.robots && {robots: homeTemplate.robots})
        };
    }

    for (const [route, meta] of Object.entries(existingSeo)) {
        if (
            route !== '/' &&
            route !== '/home' &&
            !route.startsWith(`${cleanBase}/`) &&
            !route.startsWith('/apps/') &&
            !route.startsWith('/examples/') &&
            !route.startsWith('/news/blog/') &&
            !route.startsWith('/news/releases/')
        ) {
            const {lastmod: _ignoredLastmod, ...preservedMeta} = meta || {};
            seo[route] = {...preservedMeta};
        }
    }

    if (seo['/']) {
        seo['/home'] = {...seo['/']};
    }

    if (Object.keys(seo).length > 0) {
        const viewportControllerPath = path.resolve(root, 'apps/portal/view/ViewportController.mjs');

        for (const route of Object.keys(seo)) {
            const mappedRelPath  = TOP_LEVEL_SOURCE_PATHS[route];
            const relPaths       = Array.isArray(mappedRelPath) ? mappedRelPath : (mappedRelPath ? [mappedRelPath] : []);
            const candidatePaths = [...relPaths.map(relPath => path.resolve(root, relPath)), viewportControllerPath];
            const lastmod        = resolveRouteLastmod(route, candidatePaths);

            if (lastmod) {
                seo[route].lastmod = lastmod;
            }
        }
    }

    const learnFallbackDescription = seo[cleanBase]?.description || 'Learn the fundamentals of the Neo.mjs platform.';
    const blogFallbackDescription  = seo['/news/blog']?.description || 'The official blog for the Neo.mjs platform.';

    if (await fs.pathExists(treeFilePath)) {
        const leaves = await resolveLearnTreeLeaves({learnDir, root, treeFilePath});

        for (const leaf of leaves) {
            const rawContent           = await fs.readFile(leaf.filePath, 'utf-8');
            const cleanId              = String(leaf.id).replace(/^\/+/, '');
            const route                = `${cleanBase}/${cleanId}`;
            const shouldNoindex        = leaf.hidden || isRedirectMarkdown(rawContent);
            const lastmod              = resolveRouteLastmod(route, [leaf.filePath]);
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                basePath           : cleanBase,
                fallbackDescription: learnFallbackDescription,
                fallbackTitle      : leaf.name || leaf.id,
                route
            });

            seo[route] = {
                title,
                description,
                schemaType: 'TechArticle',
                ...(lastmod && {lastmod}),
                ...(shouldNoindex && {robots: 'noindex, follow'})
            };
        }
    }

    if (await fs.pathExists(blogIndexPath)) {
        const index = await fs.readJSON(blogIndexPath);
        const posts = (Array.isArray(index?.data) ? index.data : []).filter(node => node.isLeaf && node.id);

        for (const post of posts) {
            const filePath = post.path
                ? (path.isAbsolute(post.path) ? post.path : path.resolve(root, post.path))
                : null;

            if (!filePath || !(await fs.pathExists(filePath))) {
                continue;
            }

            const rawContent           = await fs.readFile(filePath, 'utf-8');
            const slug                 = post.id.replace(/^blog\//, '');
            const route                = `/news/blog/${slug}`;
            const lastmod              = resolveRouteLastmod(route, [filePath], post.date);
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                fallbackDescription: blogFallbackDescription,
                fallbackTitle      : post.name || slug
            });

            seo[route] = {
                title,
                description,
                schemaType: 'BlogPosting',
                ...(lastmod && {lastmod})
            };
        }
    }

    const releaseEntriesByVersion = new Map();

    for (const node of await readReleaseIndex(releasesPath)) {
        const version = releaseVersionKey(node.id);

        releaseEntriesByVersion.set(version, {
            description : `Release notes and changelog for Neo.mjs v${version}.`,
            fallbackDate: normalizeIsoDateOnly(node.date),
            filePath    : null,
            title       : `Neo.mjs v${version} Release Notes`,
            version
        });
    }

    if (await fs.pathExists(releaseNotesRoot)) {
        const files = await fg('**/*.md', {
            cwd   : releaseNotesRoot,
            ignore: ['**/node_modules/**']
        });

        files.sort((a, b) => a.localeCompare(b));

        for (const file of files) {
            const filePath             = path.resolve(releaseNotesRoot, file);
            const rawContent           = await fs.readFile(filePath, 'utf-8');
            const fileName             = path.basename(file, '.md');
            const version              = releaseVersionKey(fileName);
            const existing             = releaseEntriesByVersion.get(version);
            const frontmatterDate      = extractFrontmatterDateOnly(rawContent);
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                fallbackDescription: `Release notes and changelog for Neo.mjs v${version}.`,
                fallbackTitle      : `Neo.mjs v${version} Release Notes`
            });

            releaseEntriesByVersion.set(version, {
                description,
                fallbackDate: frontmatterDate || existing?.fallbackDate || null,
                filePath,
                title,
                version
            });
        }
    }

    // When notes are available, only versions with a document can use sitemap slots.
    const markdownVersions  = [...releaseEntriesByVersion.values()].filter(entry => entry.filePath).map(entry => entry.version),
          markdownWindow    = getIndexableReleaseVersions(markdownVersions),
          indexableVersions = markdownWindow.size ? markdownWindow : getIndexableReleaseVersions([...releaseEntriesByVersion.keys()]);

    for (const entry of releaseEntriesByVersion.values()) {
        const route       = `/news/releases/${entry.version}`;
        const isIndexable = isIndexableReleaseVersion(entry.version, indexableVersions);
        const lastmod     = resolveRouteLastmod(
            route,
            entry.filePath ? [entry.filePath] : [],
            entry.fallbackDate
        );

        seo[route] = {
            title      : entry.title,
            description: entry.description,
            schemaType : 'TechArticle',
            ...(lastmod && {lastmod}),
            ...(!isIndexable && {robots: 'noindex, follow'})
        };
    }

    const [publishedFamilies, standaloneRoutes] = await Promise.all([
        getPublishedExampleFamilies({
            examplesDir,
            examplesMainContainerPath,
            familyDefinitions,
            root
        }),
        collectExampleRoutes(root)
    ]);

    for (const family of publishedFamilies) {
        const recordPaths = family.records
            .map(record => record?.sourceUrl)
            .filter(sourceUrl => typeof sourceUrl === 'string' && !/^https?:\/\//i.test(sourceUrl))
            .map(sourceUrl => path.resolve(root, sourceUrl));
        const lastmod          = resolveRouteLastmod(family.route, [family.filePath, ...recordPaths]);
        const {subject, title} = getExampleFamilySeo(family);

        seo[family.route] = {
            title,
            description: formatExampleFamilyDescription(subject, family.records),
            schemaType : 'CollectionPage',
            ...(lastmod && {lastmod})
        };
    }

    const examplesCatalogByRoute = new Map();

    try {
        for (const record of (await readExampleCatalog(examplesDir)).records) {
            const rawTarget = record.urls?.devmode || (
                typeof record.sourceUrl === 'string' && !/^https?:\/\//i.test(record.sourceUrl)
                    ? `${record.sourceUrl.replace(/\/+$/, '')}/index.html`
                    : null
            );
            const devPath = rawTarget ? String(rawTarget).split(/[?#]/, 1)[0] : null;

            if (devPath) {
                examplesCatalogByRoute.set(`/${devPath.replace(/^\/+/, '')}`, record);
            }
        }
    } catch {
        // Fall back to source HTML metadata when the catalog is absent or malformed in isolated fixtures.
    }

    for (const exampleRoute of standaloneRoutes) {
        const catalogRecord        = examplesCatalogByRoute.get(exampleRoute.id) || null;
        const {description, title} = formatStandaloneExampleSeo(exampleRoute, catalogRecord);
        const lastmod              = resolveRouteLastmod(exampleRoute.id, [path.dirname(exampleRoute.filePath)]);

        seo[exampleRoute.id] = {
            title,
            description,
            schemaType: 'WebPage',
            ...(lastmod && {lastmod})
        };
    }

    return seo;
}
