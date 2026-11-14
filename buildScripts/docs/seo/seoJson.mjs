import * as acorn     from 'acorn';
import {execFileSync} from 'child_process';
import fg             from 'fast-glob';
import fs             from 'fs-extra';
import path           from 'path';
import semver         from 'semver';

/**
 * @module buildScripts.docs.seo.seoJson
 * @summary Extracts route-specific SEO titles, descriptions, `robots` directives, and batched git `lastmod`
 * dates from Markdown and Portal sources to build `apps/portal/resources/data/seo.json` while preserving
 * curated top-level entries and pre-baked `lastmod` fallbacks when `.git` history is unavailable.
 */

const ROOT_DIR                  = process.cwd();
const DEFAULT_BASE_PATH         = '/learn';
const GIT_LOG_CHUNK_SIZE        = 200;
const GIT_LOG_MAX_BUFFER        = 64 * 1024 * 1024;
const STATUS_RENAME_CODES       = new Set(['R', 'C']);
const FRONTMATTER_BLOCK_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const ISO_DATE_ONLY_PATTERN     = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Source-file dependencies for curated top-level Portal and News hub routes so `seo.json` and
 * `sitemap-core.xml` derive identical git-backed `lastmod` dates.
 * @type {Object<String, String|String[]>}
 */
export const TOP_LEVEL_SOURCE_PATHS = {
    '/'                : ['apps/portal/index.html', 'apps/portal/view/home/MainContainer.mjs'],
    '/about-us'        : 'apps/portal/view/about/Container.mjs',
    '/docs'            : 'apps/portal/view/ViewportController.mjs',
    '/examples'        : 'apps/portal/resources/data/examples.json',
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
 * @summary Normalizes an absolute file or directory path into a repository-relative POSIX git pathspec.
 * @param {String} filePath Absolute file or directory path.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String}
 */
export function getGitPath(filePath, root=ROOT_DIR) {
    return path.relative(root, filePath).split(path.sep).join('/');
}

/**
 * @summary Checks whether `root` owns a non-shallow `.git` directory or worktree pointer whose commit
 * history is reliable for per-route `lastmod` derivation.
 *
 * Requiring `.git` directly under `root` prevents `node_modules/neo.mjs` installs and temporary test
 * directories from inheriting an enclosing workspace's unrelated git history while supporting both
 * standard clones (`.git` directory) and git worktrees (`.git` file).
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Boolean}
 */
export function hasReliableGitHistory(root=ROOT_DIR) {
    try {
        if (!fs.existsSync(path.join(root, '.git'))) {
            return false;
        }

        const isShallow = execFileSync(
            'git',
            ['rev-parse', '--is-shallow-repository'],
            {cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']}
        ).trim();

        return isShallow !== 'true';
    } catch {
        return false;
    }
}

/**
 * @summary Normalizes a raw date string or ISO timestamp into `YYYY-MM-DD`, returning `null` when invalid.
 * @param {String|null|undefined} rawValue
 * @returns {String|null}
 */
export function normalizeIsoDateOnly(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') {
        return null;
    }

    const trimmed = rawValue.trim();

    if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const ms = Date.parse(trimmed);

    return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

/**
 * @summary Extracts a normalized `YYYY-MM-DD` date from YAML frontmatter fields when present.
 * @param {String} [rawContent='']
 * @param {String[]} [fields=['publishedAt', 'updatedAt', 'createdAt']]
 * @returns {String|null}
 */
export function extractFrontmatterDateOnly(rawContent='', fields=['publishedAt', 'updatedAt', 'createdAt']) {
    const frontmatter = FRONTMATTER_BLOCK_PATTERN.exec(String(rawContent))?.[1];

    if (!frontmatter) {
        return null;
    }

    for (const field of fields) {
        const raw = new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm').exec(frontmatter)?.[1];
        const iso = normalizeIsoDateOnly(raw);

        if (iso) {
            return iso;
        }
    }

    return null;
}

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
 * @summary Determines whether a release-note version falls within the active indexable window
 * (`releaseMajor >= maxReleaseMajor - 1`, i.e., current and previous major).
 * @param {String} version
 * @param {Number|null} maxMajor
 * @returns {Boolean}
 */
export function isIndexableReleaseVersion(version, maxMajor) {
    const major = semver.coerce(version)?.major;

    if (major == null || maxMajor == null) {
        return true;
    }

    return major >= maxMajor - 1;
}

/**
 * @summary Collects newest per-file `YYYY-MM-DD` commit dates across `scanPaths` in a single batched
 * `git log --format="commit:%cs" --name-only` pass instead of spawning per-file `git` subprocesses.
 * @param {String[]} [scanPaths=[]] Repository-relative or absolute paths to include in the `git log` pass.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Map<String, String>} Map of repository-relative POSIX file path -> `YYYY-MM-DD`.
 */
export function getGitLastmodDateMap(scanPaths=[], root=ROOT_DIR) {
    const dateMap = new Map();

    if (!hasReliableGitHistory(root)) {
        return dateMap;
    }

    const relativeScanPaths = Array.from(new Set(
        scanPaths
            .filter(Boolean)
            .map(target => path.isAbsolute(target) ? getGitPath(target, root) : target.split(path.sep).join('/'))
            .map(relPath => relPath.replace(/\/+$/, ''))
            .filter(relPath => relPath && !relPath.startsWith('..') && fs.existsSync(path.resolve(root, relPath)))
    ));

    if (relativeScanPaths.length === 0) {
        return dateMap;
    }

    try {
        const output = execFileSync(
            'git',
            ['log', '--format=commit:%cs', '--name-only', '--', ...relativeScanPaths],
            {cwd: root, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore']}
        );

        let currentDate = null;

        for (const rawLine of output.split('\n')) {
            const line = rawLine.trim();

            if (!line) {
                continue;
            }

            if (line.startsWith('commit:')) {
                currentDate = line.slice('commit:'.length);
                continue;
            }

            if (currentDate && !dateMap.has(line)) {
                dateMap.set(line, currentDate);
            }
        }
    } catch {
        // Return empty map on git execution errors so callers fall back gracefully.
    }

    return dateMap;
}

/**
 * @summary Splits an array into bounded chunks that stay below shell argument limits.
 * @param {Array} items
 * @param {Number} size
 * @returns {Array<Array>}
 */
export function chunkArray(items, size) {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

/**
 * @summary Formats a `Date` instance as a sitemap-compatible ISO timestamp without milliseconds.
 * @param {Date} date
 * @returns {String}
 */
export function formatLastmodDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @summary Gets working-tree paths changed relative to `HEAD` when `root` has a reliable `.git` history.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Set<String>} Repository-relative POSIX paths.
 */
export function getChangedGitPaths(root=ROOT_DIR) {
    const paths = new Set();

    if (!hasReliableGitHistory(root)) {
        return paths;
    }

    try {
        const result = execFileSync(
            'git',
            ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
            {cwd: root, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}
        );

        const entries = result.split('\0');

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];

            if (!entry) {
                continue;
            }

            const status  = entry.slice(0, 2);
            const gitPath = entry.slice(3);

            if (STATUS_RENAME_CODES.has(status[0]) || STATUS_RENAME_CODES.has(status[1])) {
                i++;
            }

            if (gitPath) {
                paths.add(gitPath);
            }
        }
    } catch {
        // Git status is an optimization for uncommitted CI mutations; ignore if unavailable.
    }

    return paths;
}

/**
 * @summary Gets the newest working-tree `mtime` for a modified source path.
 * @param {String} gitPath Repository-relative POSIX path.
 * @param {Set<String>} changedGitPaths Changed path set from `git status`.
 * @param {Boolean} [isDirectory=false] True if `gitPath` represents a directory.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String|null}
 */
export function getChangedLastmod(gitPath, changedGitPaths, isDirectory=false, root=ROOT_DIR) {
    let lastmod = null;

    function updateLastmod(changedGitPath) {
        try {
            const filePath = path.join(root, ...changedGitPath.split('/'));
            const mtime    = fs.statSync(filePath).mtime;

            if (!lastmod || mtime > lastmod) {
                lastmod = mtime;
            }
        } catch {
            // Deleted paths are not emitted as sitemap routes; missing files can be ignored.
        }
    }

    if (changedGitPaths.has(gitPath)) {
        updateLastmod(gitPath);
    }

    if (isDirectory) {
        const gitPathWithSlash = gitPath.endsWith('/') ? gitPath : `${gitPath}/`;

        for (const changedGitPath of changedGitPaths) {
            if (changedGitPath.startsWith(gitPathWithSlash)) {
                updateLastmod(changedGitPath);
            }
        }
    }

    return lastmod ? formatLastmodDate(lastmod) : null;
}

/**
 * @summary Gets git commit `<lastmod>` ISO timestamps for multiple files or directories in bounded batches.
 * @param {String[]} filePaths Array of absolute file paths.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Map<String, String>} Map of `filePath` -> ISO date string.
 */
export function getGitLastModifiedBatch(filePaths, root=ROOT_DIR) {
    const dateMap     = new Map();
    const inRepoPaths = Array.from(new Set(filePaths)).filter(filePath => !getGitPath(filePath, root).startsWith('../'));

    if (inRepoPaths.length === 0 || !hasReliableGitHistory(root)) {
        return dateMap;
    }

    const pathDescriptors = inRepoPaths.map(filePath => {
        let isDirectory = false;

        try {
            isDirectory = fs.statSync(filePath).isDirectory();
        } catch {
            isDirectory = false;
        }

        return {
            filePath,
            gitPath: getGitPath(filePath, root),
            isDirectory
        };
    });

    try {
        for (const chunk of chunkArray(pathDescriptors, GIT_LOG_CHUNK_SIZE)) {
            try {
                const filePathByGitPath = new Map(
                    chunk.filter(({isDirectory}) => !isDirectory).map(({filePath, gitPath}) => [gitPath, filePath])
                );
                const directoryDescriptors = chunk
                    .filter(({isDirectory}) => isDirectory)
                    .map(descriptor => ({
                        ...descriptor,
                        gitPathWithSlash: descriptor.gitPath.endsWith('/') ? descriptor.gitPath : `${descriptor.gitPath}/`
                    }));

                const result = execFileSync(
                    'git',
                    ['log', '--format=__NEO_DATE__%cI', '--name-only', '--', ...chunk.map(({gitPath}) => gitPath)],
                    {cwd: root, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}
                );

                let currentDate = null;

                for (const rawLine of result.split('\n')) {
                    const line = rawLine.trim();

                    if (!line) {
                        continue;
                    }

                    if (line.startsWith('__NEO_DATE__')) {
                        currentDate = line.slice('__NEO_DATE__'.length);
                        continue;
                    }

                    if (!currentDate) {
                        continue;
                    }

                    const filePath = filePathByGitPath.get(line);

                    if (filePath && !dateMap.has(filePath)) {
                        dateMap.set(filePath, currentDate);
                    }

                    for (const descriptor of directoryDescriptors) {
                        if (!dateMap.has(descriptor.filePath) && line.startsWith(descriptor.gitPathWithSlash)) {
                            dateMap.set(descriptor.filePath, currentDate);
                        }
                    }
                }
            } catch {
                continue;
            }
        }
    } catch (error) {
        console.warn('Git is not available or error occurred:', error.message);
    }

    return dateMap;
}

/**
 * @summary Resolves the newest `YYYY-MM-DD` git commit date across one or more file or directory paths
 * from a precomputed `gitDateMap`.
 * @param {Map<String, String>} gitDateMap
 * @param {String[]} [candidatePaths=[]] Absolute file or directory paths.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String|null}
 */
function lookupNewestGitDate(gitDateMap, candidatePaths=[], root=ROOT_DIR) {
    if (!gitDateMap || gitDateMap.size === 0) {
        return null;
    }

    let newest = null;

    for (const candidatePath of candidatePaths) {
        if (!candidatePath) {
            continue;
        }

        const gitPath = getGitPath(candidatePath, root).replace(/\/+$/, '');

        if (!gitPath || gitPath.startsWith('..')) {
            continue;
        }

        const exactDate = gitDateMap.get(gitPath);

        if (exactDate && (!newest || exactDate > newest)) {
            newest = exactDate;
            continue;
        }

        const prefix = `${gitPath}/`;

        for (const [trackedPath, date] of gitDateMap.entries()) {
            if (trackedPath.startsWith(prefix) && (!newest || date > newest)) {
                newest = date;
            }
        }
    }

    return newest;
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
        return 'JavaScript Framework Comparisons (React, Angular, Vue, Solid vs Neo.mjs) | Neo.mjs';
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

/**
 * @summary Extracts a route-specific `title` and `description` from a Markdown document, honoring explicit
 * YAML frontmatter `seoTitle` and `seoDescription` overrides before falling back to `<h1>` and body prose.
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
            /^todo:/i.test(block)
        ) {
            continue;
        }

        const isBlockquote = /^>/.test(block);
        const unwrapped    = block
            .split(/\r?\n/)
            .map(line => line.replace(/^>\s?/, '').replace(/^[-*]\s+/, ''))
            .join(' ');
        const cleaned      = stripInlineMarkdown(unwrapped);

        if (cleaned.length < 35) {
            continue;
        }

        if (isBlockquote && !/^tl;dr\b/i.test(cleaned)) {
            if (!quoteFallbackDesc) {
                quoteFallbackDesc = truncateDescription(cleaned, 160);
            }
            continue;
        }

        description = truncateDescription(cleaned, 160);
        break;
    }

    return {
        title,
        description: description || quoteFallbackDesc || truncateDescription(stripInlineMarkdown(fallbackDescription), 160)
    };
}

/**
 * @summary Extracts the `familyDefinitions` config array from `apps/portal/view/examples/TabContainer.mjs`
 * via AST parsing so `TabContainer.mjs` remains the single source of truth without booting the UI runtime.
 * Throws when `familyDefinitions` is missing, non-array, or contains non-literal/incomplete entries.
 * @param {String} [source='']
 * @returns {Array<{family: String|null, title: String, route: String}>}
 */
export function extractExampleFamilyDefinitions(source='') {
    if (!source || typeof source !== 'string') {
        throw new Error('Failed to extract familyDefinitions from TabContainer.mjs: source must be a non-empty string.');
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
                throw new Error('Invalid familyDefinitions in TabContainer.mjs: expected an ArrayExpression.');
            }

            for (const element of node.value.elements) {
                if (element?.type !== 'ObjectExpression') {
                    throw new Error('Invalid familyDefinitions entry in TabContainer.mjs: expected an ObjectExpression.');
                }

                const entry = {};

                for (const prop of element.properties) {
                    if (prop?.type !== 'Property') {
                        throw new Error('Invalid familyDefinitions property in TabContainer.mjs: expected a Property.');
                    }

                    const propKey = prop.key?.name ?? prop.key?.value;

                    if (!propKey || prop.value?.type !== 'Literal') {
                        throw new Error(`Invalid familyDefinitions property "${propKey || 'unknown'}" in TabContainer.mjs: expected a Literal value.`);
                    }

                    entry[propKey] = prop.value.value;
                }

                const hasValidFamily = entry.family === null || (typeof entry.family === 'string' && entry.family.length > 0);
                const hasValidRoute  = typeof entry.route === 'string' && entry.route.startsWith('/examples');
                const hasValidTitle  = typeof entry.title === 'string' && entry.title.length > 0;

                if (!hasValidFamily || !hasValidRoute || !hasValidTitle) {
                    throw new Error('Incomplete familyDefinitions entry in TabContainer.mjs: each entry requires literal family, route, and title.');
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
        throw new Error('Failed to extract familyDefinitions from TabContainer.mjs: no definitions found.');
    }

    return definitions;
}

/**
 * @summary Builds a concise SEO description for a published `/examples/<family>` overview route
 * from its non-hidden `examples.json` catalog records, keeping only complete highlights that fit
 * within 160 characters.
 * @param {String} title
 * @param {Object[]} [records=[]]
 * @returns {String}
 */
function formatExampleFamilyDescription(title='', records=[]) {
    const count      = records.length;
    const prefix     = `Explore ${count} live Neo.mjs ${title} ${count === 1 ? 'example' : 'example' + 's'}`;
    const candidates = records
        .map(record => stripInlineMarkdown(record?.feature || record?.name || ''))
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
 * @summary Returns the ordered example family definitions (`family !== null`) from
 * `apps/portal/view/examples/TabContainer.mjs` that have at least one non-hidden record in
 * `apps/portal/resources/data/examples.json`.
 * @param {Object} [options={}]
 * @param {String} [options.examplesPath]
 * @param {String} [options.examplesTabContainerPath]
 * @param {Array<{family: String|null, title: String, route: String}>} [options.familyDefinitions]
 * @param {String} [options.root=ROOT_DIR]
 * @returns {Promise<Array<{family: String, filePath: String, records: Object[], route: String, title: String}>>}
 */
export async function getPublishedExampleFamilies(options={}) {
    const {
        root                     = ROOT_DIR,
        examplesPath             = path.resolve(root, 'apps/portal/resources/data/examples.json'),
        examplesTabContainerPath = path.resolve(root, 'apps/portal/view/examples/TabContainer.mjs'),
        familyDefinitions
    } = options;

    if (!(await fs.pathExists(examplesPath))) {
        return [];
    }

    const definitions = Array.isArray(familyDefinitions)
        ? familyDefinitions
        : extractExampleFamilyDefinitions(await fs.readFile(examplesTabContainerPath, 'utf-8'));

    const examplesRaw = await fs.readJSON(examplesPath);
    const records     = (Array.isArray(examplesRaw) ? examplesRaw : Array.isArray(examplesRaw?.data) ? examplesRaw.data : [])
        .filter(record => record && !record.hidden);

    return definitions
        .filter(definition => definition?.family && definition?.route)
        .map(definition => ({
            ...definition,
            filePath: examplesPath,
            records : records.filter(record => record.family === definition.family)
        }))
        .filter(definition => definition.records.length > 0);
}

/**
 * @summary Collects populated `/examples/<family>` overview routes from
 * `apps/portal/view/examples/TabContainer.mjs` (`familyDefinitions`) and `apps/portal/resources/data/examples.json`.
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
 * @summary Collects standalone app and example `index.html` routes under `apps/` and `examples/`,
 * excluding the Portal shell (`apps/portal/index.html`) and multi-window popup helpers (`/childapp/`, `/childapps/`).
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Promise<Array<{category: String, filePath: String, id: String, name: String}>>}
 */
export async function collectExampleRoutes(root=ROOT_DIR) {
    let files = await fg('{apps,examples}/**/index.html', {
        cwd   : root,
        ignore: ['**/node_modules/**']
    });

    files = files.filter(file =>
        file !== 'apps/portal/index.html' &&
        !/(?:^|\/)childapps?(?:\/|$)/.test(file)
    );

    files.sort((a, b) => a.localeCompare(b));

    return Promise.all(files.map(async file => {
        const filePath   = path.resolve(root, file);
        const content    = await fs.readFile(filePath, 'utf-8');
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);

        return {
            category: 'file',
            filePath,
            id      : `/${file}`,
            name    : titleMatch ? titleMatch[1] : getNameFromExamplePath(file)
        };
    }));
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

    const tree   = await fs.readJSON(treeFilePath);
    const nodes  = (Array.isArray(tree) ? tree : Array.isArray(tree?.data) ? tree.data : [])
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
 * hidden/redirect learn leaves and historical releases (`< maxReleaseMajor - 1`) with `robots: 'noindex, follow'`.
 * @param {Object} [options={}]
 * @param {String} [options.basePath='/learn']
 * @param {String} [options.blogIndexPath]
 * @param {String} [options.examplesPath]
 * @param {String} [options.examplesTabContainerPath]
 * @param {Array<{family: (String|null), title: String, route: String, iconCls: (String|undefined)}>} [options.familyDefinitions]
 * @param {String} [options.learnDir]
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
        examplesPath             = path.resolve(root, 'apps/portal/resources/data/examples.json'),
        examplesTabContainerPath,
        familyDefinitions,
        releasesPath             = path.resolve(root, 'apps/portal/resources/data/releases.json'),
        releaseNotesRoot         = path.resolve(root, '.github/RELEASE_NOTES'),
        seoJsonPath              = path.resolve(root, 'apps/portal/resources/data/seo.json')
    } = options;

    const normalizedBase     = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const cleanBase          = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const gitHistoryReliable = hasReliableGitHistory(root);
    const gitDateMap         = gitHistoryReliable
        ? getGitLastmodDateMap(['learn', 'apps', 'examples', learnDir, releaseNotesRoot], root)
        : new Map();
    const seo         = {};
    let   existingSeo = {};

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
        if (gitHistoryReliable) {
            return lookupNewestGitDate(gitDateMap, candidatePaths, root) ||
                normalizeIsoDateOnly(fallbackDate) ||
                getExistingRouteLastmod(route);
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

    if (await fs.pathExists(releasesPath)) {
        const releasesRaw = await fs.readJSON(releasesPath);
        const nodes       = (Array.isArray(releasesRaw) ? releasesRaw : Array.isArray(releasesRaw?.data) ? releasesRaw.data : [])
            .filter(node => node?.id && node.isLeaf !== false);

        for (const node of nodes) {
            const version = String(node.id).replace(/^v/, '');

            releaseEntriesByVersion.set(version, {
                description : `Release notes and changelog for Neo.mjs v${version}.`,
                fallbackDate: normalizeIsoDateOnly(node.date),
                filePath    : null,
                title       : `Neo.mjs v${version} Release Notes`,
                version
            });
        }
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
            const version              = fileName.startsWith('v') ? fileName.substring(1) : fileName;
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

    const maxReleaseMajor = getMaxReleaseMajor(Array.from(releaseEntriesByVersion.keys()));

    for (const entry of releaseEntriesByVersion.values()) {
        const route       = `/news/releases/${entry.version}`;
        const isIndexable = isIndexableReleaseVersion(entry.version, maxReleaseMajor);
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

    const publishedFamilies = await getPublishedExampleFamilies({
        examplesPath,
        examplesTabContainerPath,
        familyDefinitions,
        root
    });

    for (const family of publishedFamilies) {
        const recordPaths = family.records
            .map(record => record?.sourceUrl)
            .filter(sourceUrl => typeof sourceUrl === 'string' && !/^https?:\/\//i.test(sourceUrl))
            .map(sourceUrl => path.resolve(root, sourceUrl));
        const lastmod     = resolveRouteLastmod(family.route, [family.filePath, ...recordPaths]);

        seo[family.route] = {
            title      : `Neo.mjs ${family.title} Examples`,
            description: formatExampleFamilyDescription(family.title, family.records),
            schemaType : 'CollectionPage',
            ...(lastmod && {lastmod})
        };
    }

    return seo;
}
