import fg   from 'fast-glob';
import fs   from 'fs-extra';
import path from 'path';

const ROOT_DIR          = process.cwd();
const DEFAULT_BASE_PATH = '/learn';

const TOP_LEVEL_SEO_METADATA = Object.freeze({
    '/about-us': {
        title      : 'About Us - Neo.mjs',
        description: 'Learn more about the team behind Neo.mjs.'
    },
    '/docs': {
        title      : 'Neo.mjs Docs',
        description: 'Official documentation for the Neo.mjs platform.'
    },
    '/examples': {
        title      : 'Neo.mjs Examples',
        description: 'A collection of examples for the Neo.mjs platform.'
    },
    '/home': {
        title      : 'Neo.mjs',
        description: 'Solve your toughest UI performance challenges with Neo.mjs: a multi-threaded JavaScript platform for extreme real-time web applications, complex dashboards, and unmatched developer productivity.'
    },
    '/learn': {
        title      : 'Learn Neo.mjs',
        description: 'Learn the fundamentals of the Neo.mjs platform.'
    },
    '/news': {
        title      : 'Neo.mjs News',
        description: 'Latest updates, blogs, and releases for the Neo.mjs platform.'
    },
    '/news/blog': {
        title      : 'Neo.mjs Blog',
        description: 'The official blog for the Neo.mjs platform.'
    },
    '/news/releases': {
        title      : 'Neo.mjs Releases',
        description: 'Release notes and changelogs for the Neo.mjs platform.'
    },
    '/news/videos': {
        title      : 'Neo.mjs Videos',
        description: 'Films and demos of the Neo.mjs platform, from the engine to the AI maintainers who build it.'
    },
    '/services': {
        title      : 'Connect with Neo.mjs',
        description: 'Build an app with Neo.mjs, explore persistent project memory for coding agents, join the public development work, or reach the maintainers directly.'
    }
});

/**
 * Cleans inline Markdown formatting (links, code, emphasis, HTML tags) from a text snippet.
 * @param {String} text
 * @returns {String}
 */
function stripInlineMarkdown(text='') {
    return String(text)
        .replace(/^@summary\s+/i, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/(\*\*|__|\*|_)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Truncates a description string at a word boundary to at most `maxLength` characters.
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
 * Extracts a route-specific `title` and `description` from a Markdown document.
 * @param {String} rawContent
 * @param {Object} [options={}]
 * @param {String} [options.fallbackDescription='Learn the fundamentals of the Neo.mjs platform.']
 * @param {String} [options.fallbackTitle='Neo.mjs']
 * @param {String} [options.suffix=' - Neo.mjs']
 * @returns {{title: String, description: String}}
 */
export function extractMarkdownSeoMetadata(rawContent='', options={}) {
    const {
        fallbackDescription = 'Learn the fundamentals of the Neo.mjs platform.',
        fallbackTitle       = 'Neo.mjs',
        suffix              = ' - Neo.mjs'
    } = options;

    const withoutFrontmatter = String(rawContent).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const withoutBlocks      = withoutFrontmatter
        .replace(/```[\s\S]*?```/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<details[\s\S]*?<\/details>/gi, '');

    const h1Match   = withoutBlocks.match(/^#\s+(.+)$/m);
    const baseTitle = stripInlineMarkdown(h1Match ? h1Match[1] : fallbackTitle) || fallbackTitle;
    const title     = /neo\.mjs/i.test(baseTitle) ? baseTitle : `${baseTitle}${suffix}`;

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
 * Generates the route-keyed SEO metadata map (`apps/portal/resources/data/seo.json`) covering
 * curated top-level routes, `learn/tree.json` leaves (`/learn/*`), `blog.json` leaves (`/news/blog/*`),
 * and release-note leaves (`/news/releases/*`).
 * @param {Object} [options={}]
 * @param {String} [options.basePath='/learn']
 * @param {String} [options.blogIndexPath]
 * @param {String} [options.learnDir]
 * @param {String} [options.releaseNotesRoot]
 * @param {String} [options.releasesPath]
 * @param {String} [options.root=ROOT_DIR]
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
        releaseNotesRoot = path.resolve(root, '.github/RELEASE_NOTES')
    } = options;

    const normalizedBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
    const cleanBase      = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const seo            = {};

    for (const [route, meta] of Object.entries(TOP_LEVEL_SEO_METADATA)) {
        seo[route] = {...meta};
    }

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
                fallbackDescription: TOP_LEVEL_SEO_METADATA['/learn'].description,
                fallbackTitle      : node.name || node.id
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
                fallbackDescription: TOP_LEVEL_SEO_METADATA['/news/blog'].description,
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
