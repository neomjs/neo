import fg   from 'fast-glob';
import fs   from 'fs-extra';
import path from 'path';

/**
 * @module buildScripts.docs.seo.seoJson
 * @summary Extracts route-specific SEO titles and descriptions from Markdown sources and builds
 * `apps/portal/resources/data/seo.json` while preserving curated top-level entries from the file itself.
 */

const ROOT_DIR          = process.cwd();
const DEFAULT_BASE_PATH = '/learn';

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
 * @returns {String}
 */
export function formatLearnSeoTitle(baseTitle='', route='', suffix=' - Neo.mjs') {
    const cleanTitle      = String(baseTitle || '').trim();
    const normalizedRoute = String(route || '').trim();

    if (/^\/learn\/comparisons\/overview$/i.test(normalizedRoute)) {
        return 'JavaScript Framework Comparisons (React, Angular, Vue, Solid vs Neo.mjs) | Neo.mjs';
    }

    if (cleanTitle && cleanTitle.toLowerCase() !== 'neo.mjs' && normalizedRoute.startsWith('/learn/')) {
        if (/\|\s*Neo\.mjs$/i.test(cleanTitle)) {
            return cleanTitle;
        }

        const hasDashQualifier = /(?:\s(?:—|--|-)\s|:\s)/.test(cleanTitle);
        const mentionsNeo      = /neo\.?mjs/i.test(cleanTitle);

        if (/^\/learn\/comparisons\//i.test(normalizedRoute) && !hasDashQualifier && cleanTitle.length < 45) {
            return `${cleanTitle} — Multi-Threaded JavaScript UI Comparison | Neo.mjs`;
        }

        if (!mentionsNeo && !hasDashQualifier && cleanTitle.length < 45) {
            if (/^\/learn\/benefits\/body\//i.test(normalizedRoute)) {
                return `${cleanTitle} — Multi-Threaded JavaScript Application Engine | Neo.mjs`;
            }
            if (/^\/learn\/(?:benefits|agentos)\//i.test(normalizedRoute)) {
                return `${cleanTitle} — AI Agent OS & Multi-Threaded Web Engine | Neo.mjs`;
            }
            if (/^\/learn\/guides\//i.test(normalizedRoute)) {
                return `${cleanTitle} — Neo.mjs Developer Guide`;
            }
            if (/^\/learn\/tutorials\//i.test(normalizedRoute)) {
                return `${cleanTitle} — Neo.mjs Tutorial | Neo.mjs`;
            }
            return `${cleanTitle} — Multi-Threaded JavaScript UI Engine | Neo.mjs`;
        }
    }

    return /neo\.mjs/i.test(cleanTitle) ? cleanTitle : `${cleanTitle}${suffix}`;
}

/**
 * @summary Extracts a route-specific `title` and `description` from a Markdown document.
 * @param {String} rawContent
 * @param {Object} [options={}]
 * @param {String} [options.fallbackDescription='Learn the fundamentals of the Neo.mjs platform.']
 * @param {String} [options.fallbackTitle='Neo.mjs']
 * @param {String} [options.route='']
 * @param {String} [options.suffix=' - Neo.mjs']
 * @returns {{title: String, description: String}}
 */
export function extractMarkdownSeoMetadata(rawContent='', options={}) {
    const {
        fallbackDescription = 'Learn the fundamentals of the Neo.mjs platform.',
        fallbackTitle       = 'Neo.mjs',
        route               = '',
        suffix              = ' - Neo.mjs'
    } = options;

    const withoutFrontmatter = String(rawContent).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const withoutCodeBlocks  = withoutFrontmatter.replace(/```[\s\S]*?```/g, '');
    const withoutComments    = replaceUntilStable(withoutCodeBlocks, /<!--[\s\S]*?-->/g, '');
    const withoutBlocks      = replaceUntilStable(withoutComments, /<details[\s\S]*?<\/details>/gi, '');

    const h1Match   = withoutBlocks.match(/^#\s+(.+)$/m);
    const baseTitle = stripInlineMarkdown(h1Match ? h1Match[1] : fallbackTitle) || fallbackTitle;
    const title     = formatLearnSeoTitle(baseTitle, route, suffix);

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
 * @summary Generates the route-keyed SEO metadata map (`apps/portal/resources/data/seo.json`) covering
 * curated top-level routes preserved from `seoJsonPath`, `learn/tree.json` leaves (`/learn/*`),
 * `blog.json` leaves (`/news/blog/*`), and release-note leaves (`/news/releases/*`).
 * @param {Object} [options={}]
 * @param {String} [options.basePath='/learn']
 * @param {String} [options.blogIndexPath]
 * @param {String} [options.learnDir]
 * @param {String} [options.releaseNotesRoot]
 * @param {String} [options.releasesPath]
 * @param {String} [options.root=ROOT_DIR]
 * @param {String} [options.seoJsonPath]
 * @param {String} [options.treeFilePath]
 * @returns {Promise<Object<String, {title: String, description: String, schemaType?: String}>>}
 */
export async function getSeoJson(options={}) {
    const {
        basePath         = DEFAULT_BASE_PATH,
        root             = ROOT_DIR,
        learnDir         = path.resolve(root, 'learn'),
        treeFilePath     = path.join(learnDir, 'tree.json'),
        blogIndexPath    = path.resolve(root, 'apps/portal/resources/data/blog.json'),
        releasesPath     = path.resolve(root, 'apps/portal/resources/data/releases.json'),
        releaseNotesRoot = path.resolve(root, '.github/RELEASE_NOTES'),
        seoJsonPath      = path.resolve(root, 'apps/portal/resources/data/seo.json')
    } = options;

    const normalizedBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const cleanBase      = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const seo            = {};

    if (await fs.pathExists(seoJsonPath)) {
        const existingSeo = await fs.readJSON(seoJsonPath);

        for (const [route, meta] of Object.entries(existingSeo || {})) {
            if (
                !route.startsWith(`${cleanBase}/`) &&
                !route.startsWith('/news/blog/') &&
                !route.startsWith('/news/releases/')
            ) {
                seo[route] = {...meta};
            }
        }
    }

    const learnFallbackDescription = seo[cleanBase]?.description || 'Learn the fundamentals of the Neo.mjs platform.';
    const blogFallbackDescription  = seo['/news/blog']?.description || 'The official blog for the Neo.mjs platform.';

    if (await fs.pathExists(treeFilePath)) {
        const tree  = await fs.readJSON(treeFilePath);
        const nodes = (Array.isArray(tree) ? tree : Array.isArray(tree?.data) ? tree.data : [])
            .filter(node => node?.id && node.isLeaf !== false);

        for (const node of nodes) {
            const filePath = path.join(learnDir, `${node.id}.md`);

            if (!(await fs.pathExists(filePath))) {
                continue;
            }

            const rawContent           = await fs.readFile(filePath, 'utf-8');
            const cleanId              = String(node.id).replace(/^\/+/, '');
            const route                = `${cleanBase}/${cleanId}`;
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                fallbackDescription: learnFallbackDescription,
                fallbackTitle      : node.name || node.id,
                route
            });

            seo[route] = {
                title,
                description,
                schemaType: 'TechArticle'
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
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                fallbackDescription: blogFallbackDescription,
                fallbackTitle      : post.name || slug
            });

            seo[route] = {
                title,
                description,
                schemaType: 'BlogPosting'
            };
        }
    }

    if (await fs.pathExists(releasesPath)) {
        const releasesRaw = await fs.readJSON(releasesPath);
        const nodes       = (Array.isArray(releasesRaw) ? releasesRaw : Array.isArray(releasesRaw?.data) ? releasesRaw.data : [])
            .filter(node => node?.id && node.isLeaf !== false);

        for (const node of nodes) {
            const version = String(node.id).replace(/^v/, '');
            const route   = `/news/releases/${version}`;

            seo[route] = {
                title      : `Neo.mjs v${version} Release Notes`,
                description: `Release notes and changelog for Neo.mjs v${version}.`,
                schemaType : 'TechArticle'
            };
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
            const route                = `/news/releases/${version}`;
            const {title, description} = extractMarkdownSeoMetadata(rawContent, {
                fallbackDescription: `Release notes and changelog for Neo.mjs v${version}.`,
                fallbackTitle      : `Neo.mjs v${version} Release Notes`
            });

            seo[route] = {
                title,
                description,
                schemaType: 'TechArticle'
            };
        }
    }

    return seo;
}
