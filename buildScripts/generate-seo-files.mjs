import fs              from 'fs-extra';
import path            from 'path';
import {execSync}      from 'child_process';
import {fileURLToPath} from 'url';

const ROOT_DIR                 = process.cwd();
const LEARN_DIR                = path.resolve(ROOT_DIR, 'learn');
const TREE_FILE_PATH           = path.join(LEARN_DIR, 'tree.json');
const DEFAULT_BASE_PATH        = '/learn';
const SUPPORTED_DOC_EXTENSIONS = ['.md', '.mdx', '.json'];

/**
 * Gets the last git commit date for a specific file.
 * @param {String} filePath - Absolute path to the file
 * @returns {String|null} ISO 8601 date string or null if not in git
 */
function getGitLastModified(filePath) {
    try {
        const result = execSync(
            `git log -1 --format=%cI -- "${filePath}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        ).trim();

        return result || null;
    } catch (error) {
        return null;
    }
}

/**
 * Gets last modified dates for multiple files in a batch (more efficient).
 * @param {String[]} filePaths - Array of absolute file paths
 * @returns {Map<String, String>} Map of filePath -> ISO date string
 */
function getGitLastModifiedBatch(filePaths) {
    const dateMap = new Map();

    if (filePaths.length === 0) {
        return dateMap;
    }

    try {
        for (const filePath of filePaths) {
            try {
                const result = execSync(
                    `git log -1 --format=%cI -- "${filePath}"`,
                    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
                ).trim();

                if (result) {
                    dateMap.set(filePath, result);
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
 * Loads the tree.json structure and returns the raw node data.
 * @returns {Promise<Object[]>}
 */
async function loadTreeNodes() {
    const tree  = await fs.readJSON(TREE_FILE_PATH);
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
 * @returns {Promise<Array<{id: String, filePath: String}>>} Route data with file paths
 */
async function collectRoutesFromTree() {
    const nodes  = await loadTreeNodes();
    const routes = [];

    for (const node of nodes) {
        if (!node?.id) continue;
        const contentPath = await resolveContentFileFromId(node.id);
        if (!contentPath) continue;
        routes.push({
            id: node.id,
            filePath: contentPath
        });
    }

    return routes;
}

/**
 * Normalizes a content id into a hash-based route path suitable for a Single-Page Application.
 * @param {String} id
 * @param {String} [basePath=DEFAULT_BASE_PATH]
 * @returns {String} e.g., /#/learn/benefits/Introduction
 */
function buildRouteFromId(id, basePath = DEFAULT_BASE_PATH) {
    const trimmedBase = (basePath ?? '').replace(/\/$/, '');
    const trimmedId   = id.replace(/^\//, '');
    const prefix      = trimmedBase.length > 0 ? trimmedBase : '';
    const route       = `${prefix}/${trimmedId}`.replace(/\/+/g, '/');
    return `/#${route.startsWith('/') ? route : `/${route}`}`;
}

/**
 * Generates a normalized list of content routes (relative to the site root).
 * @param {Object} [options]
 * @param {String} [options.basePath='/learn']
 * @returns {Promise<String[]>}
 */
export async function getContentRoutes(options = {}) {
    const basePath  = options.basePath ?? DEFAULT_BASE_PATH;
    const routeData = await collectRoutesFromTree();

    const routes = routeData
        .map(({id}) => buildRouteFromId(id, basePath))
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
 * @param {Boolean} [options.includeLastmod=true] Whether to include <lastmod> from git
 * @returns {Promise<String>}
 */
export async function getSitemapXml(options = {}) {
    const {baseUrl, basePath = DEFAULT_BASE_PATH, includeLastmod = true} = options;

    if (!baseUrl) {
        throw new Error('getSitemapXml requires a baseUrl option to produce absolute URLs.');
    }

    const routeData         = await collectRoutesFromTree();
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // Get git lastmod dates for all files in batch
    let lastModMap = new Map();
    if (includeLastmod) {
        const filePaths = routeData.map(({filePath}) => filePath);
        lastModMap = getGitLastModifiedBatch(filePaths);
    }

    const xmlEntries = routeData.map(({id, filePath}) => {
        const route = buildRouteFromId(id, basePath);
        const url = new URL(route, normalizedBaseUrl).toString();
        const lastmod = lastModMap.get(filePath);

        const lastmodXml = lastmod
            ? `\n    <lastmod>${lastmod}</lastmod>`
            : '';

        return `  <url>
    <loc>${url}</loc>${lastmodXml}
  </url>`;
    }).join('\n');

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
            case '--output':
            case '-o':
                options.output = args[++i];
                break;
            case '--no-lastmod':
                options.includeLastmod = false;
                break;
            default:
                console.warn(`Unknown argument "${arg}" ignored.`);
                break;
        }
    }

    const format = (options.format || 'array').toLowerCase();
    let outputContent;

    switch (format) {
        case 'array': {
            const routes = await getContentRoutes({basePath: options.basePath});
            outputContent = JSON.stringify(routes, null, 2);
            break;
        }
        case 'urls': {
            const urls = await getContentUrls({
                baseUrl : options.baseUrl,
                basePath: options.basePath
            });
            outputContent = JSON.stringify(urls, null, 2);
            break;
        }
        case 'xml': {
            outputContent = await getSitemapXml({
                baseUrl        : options.baseUrl,
                basePath       : options.basePath,
                includeLastmod : options.includeLastmod !== false
            });
            break;
        }
        case 'llm':
        case 'llm.txt': {
            outputContent = await getLlmTxt({
                baseUrl : options.baseUrl,
                basePath: options.basePath
            });
            break;
        }
        default:
            throw new Error(`Unsupported format "${options.format}". Supported formats: array, urls, xml, llm.`);
    }

    if (options.output) {
        const outputPath = path.resolve(ROOT_DIR, options.output);
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, outputContent);
        console.log(`Successfully wrote output to ${options.output}`);
    } else {
        console.log(outputContent);
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
