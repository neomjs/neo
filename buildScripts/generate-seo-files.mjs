import fs from 'fs-extra';
import path from 'path';
import {fileURLToPath} from 'url';

const ROOT_DIR        = process.cwd();
const LEARN_DIR       = path.resolve(ROOT_DIR, 'learn');
const TREE_FILE_PATH  = path.join(LEARN_DIR, 'tree.json');
const BLOG_DIR_PATH   = path.join(LEARN_DIR, 'blog');
const DEFAULT_BASE_PATH = '/learn';
const SUPPORTED_DOC_EXTENSIONS = ['.md', '.mdx', '.json'];

/**
 * Loads the tree.json structure and returns the raw node data.
 * @returns {Promise<Object[]>}
 */
async function loadTreeNodes() {
    const tree = await fs.readJSON(TREE_FILE_PATH);
    const nodes = Array.isArray(tree) ? tree : Array.isArray(tree?.data) ? tree.data : [];
    return nodes.filter(node => node?.id);
}

/**
 * Attempts to resolve a content file on disk that matches the provided tree id.
 * @param {String} id
 * @returns {Promise<String|null>} The absolute file path if found, otherwise null.
 */
async function resolveContentFileFromId(id) {
    const segments = id.split('/').filter(Boolean);

    const directCandidates = SUPPORTED_DOC_EXTENSIONS.map(extension => (
        path.join(LEARN_DIR, ...segments) + extension
    ));

    const nestedCandidates = SUPPORTED_DOC_EXTENSIONS.flatMap(extension => ([
        path.join(LEARN_DIR, ...segments, `README${extension}`),
        path.join(LEARN_DIR, ...segments, `index${extension}`)
    ]));

    const candidates = [...directCandidates, ...nestedCandidates];

    for (const candidate of candidates) {
        if (await fs.pathExists(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Collects all tree-based routes that map to actual content files.
 * @returns {Promise<Set<String>>} Route id set (e.g. "benefits/Introduction").
 */
async function collectRoutesFromTree() {
    const nodes     = await loadTreeNodes();
    const routeIds  = new Set();

    for (const node of nodes) {
        if (!node?.id) continue;
        const contentPath = await resolveContentFileFromId(node.id);
        if (!contentPath) continue;
        routeIds.add(node.id);
    }

    return routeIds;
}

/**
 * Scans the blog directory for markdown files that may not be listed in tree.json.
 * @returns {Promise<Set<String>>}
 */
async function collectRoutesFromBlog() {
    const routeIds = new Set();

    if (!(await fs.pathExists(BLOG_DIR_PATH))) {
        return routeIds;
    }

    const entries = await fs.readdir(BLOG_DIR_PATH);

    for (const entry of entries) {
        const entryPath = path.join(BLOG_DIR_PATH, entry);
        const stat = await fs.stat(entryPath);

        if (!stat.isFile()) {
            continue;
        }

        const extension = path.extname(entry).toLowerCase();

        if (!SUPPORTED_DOC_EXTENSIONS.includes(extension)) {
            continue;
        }

        const slug = entry.slice(0, -extension.length);
        routeIds.add(`blog/${slug}`);
    }

    return routeIds;
}

/**
 * Normalizes a content id into a route path using the provided base path.
 * @param {String} id
 * @param {String} [basePath=DEFAULT_BASE_PATH]
 * @returns {String}
 */
function buildRouteFromId(id, basePath = DEFAULT_BASE_PATH) {
    const trimmedBase = (basePath ?? '').replace(/\/$/, '');
    const trimmedId   = id.replace(/^\//, '');
    const prefix      = trimmedBase.length > 0 ? trimmedBase : '';
    const route       = `${prefix}/${trimmedId}`.replace(/\/+/g, '/');
    return route.startsWith('/') ? route : `/${route}`;
}

/**
 * Generates a normalized list of content routes (relative to the site root).
 * @param {Object} [options]
 * @param {String} [options.basePath='/learn']
 * @returns {Promise<String[]>}
 */
export async function getContentRoutes(options = {}) {
    const basePath = options.basePath ?? DEFAULT_BASE_PATH;
    const treeRoutes = await collectRoutesFromTree();
    const blogRoutes = await collectRoutesFromBlog();

    blogRoutes.forEach(id => treeRoutes.add(id));

    const routes = Array.from(treeRoutes)
        .map(id => buildRouteFromId(id, basePath))
        .sort((a, b) => a.localeCompare(b));

    return routes;
}

/**
 * Returns fully qualified URLs for all content routes.
 * @param {Object} [options]
 * @param {String} options.baseUrl Absolute base URL (e.g. https://neomjs.github.io)
 * @param {String} [options.basePath='/learn']
 * @returns {Promise<String[]>}
 */
export async function getContentUrls(options = {}) {
    const {baseUrl, basePath = DEFAULT_BASE_PATH} = options;
    const routes = await getContentRoutes({basePath});

    if (!baseUrl) {
        return routes;
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return routes.map(route => new URL(route, normalizedBaseUrl).toString());
}

/**
 * Formats the content URLs as a sitemap.xml string.
 * @param {Object} options
 * @param {String} options.baseUrl Absolute base URL required for sitemap entries.
 * @param {String} [options.basePath='/learn']
 * @returns {Promise<String>}
 */
export async function getSitemapXml(options = {}) {
    const {baseUrl, basePath = DEFAULT_BASE_PATH} = options;

    if (!baseUrl) {
        throw new Error('getSitemapXml requires a baseUrl option to produce absolute URLs.');
    }

    const urls = await getContentUrls({baseUrl, basePath});
    const xmlEntries = urls.map(loc => (
`  <url>
    <loc>${loc}</loc>
  </url>`
    )).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>
`;
}

/**
 * Formats the content URLs for llm.txt consumption (newline separated).
 * @param {Object} [options]
 * @param {String} options.baseUrl Optional absolute base URL.
 * @param {String} [options.basePath='/learn']
 * @returns {Promise<String>}
 */
export async function getLlmTxt(options = {}) {
    const urls = await getContentUrls(options);
    return urls.join('\n');
}

async function runCli() {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
        case '--format':
        case '-f':
            options.format = args[++i];
            break;
        case '--base-url':
            options.baseUrl = args[++i];
            break;
        case '--base-path':
            options.basePath = args[++i];
            break;
        default:
            console.warn(`Unknown argument "${arg}" ignored.`);
            break;
        }
    }

    const format = (options.format || 'array').toLowerCase();

    switch (format) {
    case 'array': {
        const routes = await getContentRoutes({basePath: options.basePath});
        console.log(JSON.stringify(routes, null, 2));
        break;
    }
    case 'urls': {
        const urls = await getContentUrls({
            baseUrl : options.baseUrl,
            basePath: options.basePath
        });
        console.log(JSON.stringify(urls, null, 2));
        break;
    }
    case 'xml': {
        const xml = await getSitemapXml({
            baseUrl : options.baseUrl,
            basePath: options.basePath
        });
        console.log(xml);
        break;
    }
    case 'llm':
    case 'llm.txt': {
        const txt = await getLlmTxt({
            baseUrl : options.baseUrl,
            basePath: options.basePath
        });
        console.log(txt);
        break;
    }
    default:
        throw new Error(`Unsupported format "${options.format}". Supported formats: array, urls, xml, llm.`);
    }
}

const cliEntryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath   = fileURLToPath(import.meta.url);

if (cliEntryPath && cliEntryPath === modulePath) {
    runCli().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

export default {
    getContentRoutes,
    getContentUrls,
    getSitemapXml,
    getLlmTxt
};
