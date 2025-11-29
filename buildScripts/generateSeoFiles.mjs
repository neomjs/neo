import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {execSync}      from 'child_process';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';

const ROOT_DIR          = process.cwd();
const LEARN_DIR         = path.resolve(ROOT_DIR, 'learn');
const PORTAL_DIR        = path.resolve(ROOT_DIR, 'apps/portal');
const TREE_FILE_PATH    = path.join(LEARN_DIR, 'tree.json');
const DEFAULT_BASE_PATH = '/learn';

// Top-level routes that don't map to content files
const TOP_LEVEL_ROUTES = [
    '/about-us',
    '/blog',
    '/docs',
    '/examples',
    '/home',
    '/services'
];

const PRIORITIES = new Map([
    // Top-level pages
    ['/home'    , 1.0],
    ['/docs'    , 0.9],
    ['/examples', 0.9],
    ['/blog'    , 0.8],
    ['/about-us', 0.7],
    ['/services', 0.7],

    // High-value content
    ['guides/fundamentals/CodebaseOverview'         , 1.0],

    ['benefits/ConfigSystem'                        , 0.9],
    ['benefits/Effort'                              , 0.9],
    ['benefits/Features'                            , 0.9],
    ['benefits/FormsEngine'                         , 0.9],
    ['benefits/FourEnvironments'                    , 0.9],
    ['benefits/Introduction'                        , 0.9],
    ['benefits/MultiWindow'                         , 0.9],
    ['benefits/OffTheMainThread'                    , 0.9],
    ['benefits/Quick'                               , 0.9],
    ['benefits/RPCLayer'                            , 0.9],
    ['benefits/Speed'                               , 0.9],

    ['blog/context-engineering-done-right'          , 0.9],
    ['blog/ai-native-platform-answers-questions'    , 0.9],
    ['blog/v10-deep-dive-state-provider'            , 0.9],
    ['blog/benchmarking-frontends-2025'             , 0.9],
    ['blog/v10-deep-dive-vdom-revolution'           , 0.9],
    ['blog/v10-deep-dive-functional-components'     , 0.9],
    ['blog/v10-deep-dive-reactivity'                , 0.9],
    ['blog/v10-post1-love-story'                    , 0.9],
    ['blog/json-blueprints-and-shared-workers'      , 0.9],

    ['comparisons/NeoVsAngular'                     , 0.8],
    ['comparisons/NeoVsExtJs'                       , 0.8],
    ['comparisons/NeoVsNextJs'                      , 0.8],
    ['comparisons/NeoVsReact'                       , 0.8],
    ['comparisons/NeoVsSolid'                       , 0.8],
    ['comparisons/NeoVsVue'                         , 0.8],

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
    ['guides/datahandling/Grids'                      , 0.8],
    ['guides/userinteraction/Forms'                   , 0.8]
]);

const DEFAULT_PRIORITY = 0.5;

/**
 * Gets the priority for a given route ID.
 * @param {String} id The route ID
 * @returns {Number} The priority value
 */
function getPriority(id) {
    // Normalize ID by removing .md extension if present
    const cleanId = id.endsWith('.md') ? id.slice(0, -3) : id;
    return PRIORITIES.get(cleanId) || DEFAULT_PRIORITY;
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
    const filePath = path.join(LEARN_DIR, id + '.md');

    if (await fs.pathExists(filePath)) {
        return filePath;
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
            category: 'tree',
            filePath: contentPath,
            id      : node.id,
            name    : node.name
        });
    }

    return routes;
}

/**
 * Collects top-level routes that don't have content files.
 * @returns {Promise<Array<{id: String, filePath: String|null}>>}
 */
async function collectTopLevelRoutes() {
    return TOP_LEVEL_ROUTES.map(route => ({
        category: 'top-level',
        filePath: path.join(PORTAL_DIR, 'view/ViewportController.mjs'),
        id      : route
    }));
}

/**
 * Derives a human-readable name from an example path as a fallback.
 * e.g., 'examples/grid/bigData/index.html' -> 'Big Data'
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
 * Collects all example routes by scanning the filesystem and reading their titles.
 * @returns {Promise<Array<{id: String, filePath: String, name: String}>>}
 */
async function collectExampleRoutes() {
    let files = await fg('{apps,examples}/**/index.html', {
        cwd    : ROOT_DIR,
        ignore : ['**/node_modules/**']
    });

    // Filter out paths containing "childapps"
    files = files.filter(file => !file.includes('childapps'));

    // Sort by path, which will put 'apps/' before 'examples/'
    files.sort((a, b) => a.localeCompare(b));

    return Promise.all(files.map(async (file) => {
        const filePath = path.resolve(ROOT_DIR, file);
        const content  = await fs.readFile(filePath, 'utf-8');
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);

        return {
            category: 'file',
            filePath: filePath,
            id      : `/${file}`,
            name    : titleMatch ? titleMatch[1] : getNameFromExamplePath(file)
        };
    }));
}

/**
 * Collects all routes (top-level + content routes).
 * @returns {Promise<Array<{id: String, filePath: String|null}>>}
 */
async function collectAllRoutes() {
    const [topLevelRoutes, contentRoutes, exampleRoutes] = await Promise.all([
        collectTopLevelRoutes(),
        collectRoutesFromTree(),
        collectExampleRoutes()
    ]);

    return [...topLevelRoutes, ...contentRoutes, ...exampleRoutes];
}

/**
 * Normalizes a route id into a hash-based route path suitable for a Single-Page Application.
 * @param {String} id
 * @param {String} [basePath] - Only used for content routes (e.g., '/learn')
 * @param {Boolean} [useHash=true] - Whether to prepend /# to the route
 * @returns {String} e.g., /#/home or /home
 */
function buildRouteFromId(id, basePath=null, useHash=true) {
    // Top-level routes don't use basePath
    if (id.startsWith('/')) {
        return useHash ? `/#${id}` : id;
    }

    // Content routes use basePath
    const trimmedBase = (basePath ?? DEFAULT_BASE_PATH).replace(/\/$/, '');
    const trimmedId   = id.replace(/^\//, '');
    const prefix      = trimmedBase.length > 0 ? trimmedBase : '';
    const route       = `${prefix}/${trimmedId}`.replace(/\/+/g, '/');
    const fullRoute   = route.startsWith('/') ? route : `/${route}`;

    return useHash ? `/#${fullRoute}` : fullRoute;
}

/**
 * Generates a normalized list of all routes (relative to the site root).
 * @param {Object} [options]
 * @param {String} [options.basePath='/learn'] - Only applies to content routes
 * @param {Boolean} [options.includeTopLevel=true] - Include top-level routes
 * @returns {Promise<String[]>}
 */
export async function getContentRoutes(options={}) {
    const {basePath = DEFAULT_BASE_PATH, includeTopLevel = true} = options;
    const allRoutes = await collectAllRoutes();

    const routes = allRoutes
        .filter(({id}) => includeTopLevel || !id.startsWith('/'))
        .map(({category, id}) => {
            if (category === 'file') {
                return id; // Already has leading slash
            }
            if (category === 'top-level') {
                return buildRouteFromId(id);
            }
            // category === 'tree'
            return buildRouteFromId(id, basePath);
        })
        .sort((a, b) => a.localeCompare(b));

    return routes;
}

/**
 * Generates a list of route objects containing both real and client-side routes.
 * @param {Object} [options]
 * @param {String} [options.basePath='/learn'] - Only applies to content routes
 * @param {Boolean} [options.includeTopLevel=true] - Include top-level routes
 * @returns {Promise<Array<{route: String, clientSideRoute: String}>>}
 */
export async function getContentRouteObjects(options={}) {
    const {basePath = DEFAULT_BASE_PATH, includeTopLevel = true} = options;
    const allRoutes = await collectAllRoutes();

    const routes = allRoutes
        .filter(({id}) => includeTopLevel || !id.startsWith('/'))
        .map(({category, id}) => {
            if (category === 'file') {
                return {
                    route          : id,
                    clientSideRoute: ''
                };
            }

            if (category === 'top-level') {
                return {
                    route          : buildRouteFromId(id, null, false),
                    clientSideRoute: buildRouteFromId(id, null, true)
                };
            }

            // category === 'tree'
            return {
                route          : buildRouteFromId(id, basePath, false),
                clientSideRoute: buildRouteFromId(id, basePath, true)
            };
        })
        .sort((a, b) => a.route.localeCompare(b.route));

    return routes;
}

/**
 * Returns fully qualified URLs for all routes.
 * @param {Object} [options]
 * @param {String} options.baseUrl Absolute base URL (e.g. https://neomjs.github.io)
 * @param {String} [options.basePath='/learn'] - Only applies to content routes
 * @param {Boolean} [options.includeTopLevel=true] - Include top-level routes
 * @returns {Promise<String[]>}
 */
export async function getContentUrls(options={}) {
    const {baseUrl, basePath=DEFAULT_BASE_PATH, includeTopLevel=true} = options;
    const routes = await getContentRoutes({basePath, includeTopLevel});

    if (!baseUrl) {
        return routes;
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return routes.map(route => new URL(route, normalizedBaseUrl).toString());
}

/**
 * Formats all routes as a sitemap.xml string.
 * @param {Object} options
 * @param {String} options.baseUrl Absolute base URL required for sitemap entries.
 * @param {String} [options.basePath='/learn'] - Only applies to content routes
 * @param {Boolean} [options.includeLastmod=true] Whether to include <lastmod> from git
 * @param {Boolean} [options.includeTopLevel=true] - Include top-level routes
 * @returns {Promise<String>}
 */
export async function getSitemapXml(options={}) {
    const {
              baseUrl,
              basePath = DEFAULT_BASE_PATH,
              includeLastmod  = true,
              includeTopLevel = true
          } = options;

    if (!baseUrl) {
        throw new Error('getSitemapXml requires a baseUrl option to produce absolute URLs.');
    }

    const allRoutes = await collectAllRoutes();
    const filteredRoutes = allRoutes.filter(({id}) =>
        includeTopLevel || !id.startsWith('/')
    );

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // Get git lastmod dates for all files in batch
    let lastModMap = new Map();
    if (includeLastmod) {
        const filePaths = filteredRoutes
            .map(({id, filePath}) => {
                if (!filePath) return null;
                // For examples, use the parent directory to get the last modification date
                // of any file within the example.
                if (id.endsWith('.html')) {
                    return path.dirname(filePath);
                }
                return filePath;
            })
            .filter(Boolean);
        lastModMap = getGitLastModifiedBatch(filePaths);
    }

    const xmlEntries = filteredRoutes.map(({category, id, filePath}) => {
        let url;
        if (category === 'file') {
            url = new URL(id, normalizedBaseUrl).toString();
        } else if (category === 'top-level') {
            const route = buildRouteFromId(id, null, false);
            url = new URL(route, normalizedBaseUrl).toString();
        } else { // tree
            const route = buildRouteFromId(id, basePath, false);
            url = new URL(route, normalizedBaseUrl).toString();
        }

        let lastmod = null;
        if (filePath) {
            const key = category === 'file' ? path.dirname(filePath) : filePath;
            lastmod = lastModMap.get(key);
        }

        const priority = getPriority(id);

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
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>
`;
}

/**
 * Formats the content URLs for llms.txt consumption (newline separated).
 * @param {Object} [options]
 * @param {String} options.baseUrl Optional absolute base URL.
 * @param {String} [options.basePath='/learn'] - Only applies to content routes
 * @param {Boolean} [options.includeTopLevel=true] - Include top-level routes
 * @returns {Promise<String>}
 */
export async function getLlmsTxt(options={}) {
    const {baseUrl, basePath = DEFAULT_BASE_PATH} = options;
    const allRoutes = await collectAllRoutes();

    let content = `# Neo.mjs Platform

> Neo.mjs is not a library, but a comprehensive web platform and a new operating system for the web, with over 1000 
> files and 130,000 lines of code. It is architected for AI collaboration from the ground up, featuring three dedicated 
> Model Context Protocol (MCP) servers. It reimagines web development from first principles, treating the browser as a 
> distributed computing environment, not a single-threaded document renderer.
>
> The core of Neo.mjs is its truly multi-threaded architecture which moves all application logic, state management, and 
> data processing off the main thread. This ensures a "jank-free" user experience where the UI remains perfectly 
> responsive, regardless of the workload. The platform provides a holistic, managed environment with operational 
> guarantees, a unified class config system for declaratively describing entire component trees, and critical operational 
> primitives like multi-window state. It includes an enterprise-grade component library.
>
> The developer experience is revolutionary and future-proof, featuring a zero-builds development mode that is 100% based 
> on web standards. This eliminates the frustrating abstraction layer of bundlers and transpilers and ensures that 
> applications evolve with the web platform itself.

Neo.mjs uniquely deploys each application and example in four equivalent environments, each serving identical 
functionality through different code delivery methods: development mode (zero-builds), dist/development (bundled, 
unminified), dist/esm (native ES modules, optimized), and dist/production (bundled, minified). 

The URLs listed below use the development mode paths (e.g., /apps/ or /examples/), representing the zero-builds, 
browser-native version that embodies Neo.mjs's core philosophy. To access any application in a different environment, 
simply prefix the path with /dist/development/, /dist/esm/, or /dist/production/.

For example, the Portal app is available at all four environment URLs, plus a fifth version mapped to the domain root:
- https://neomjs.com/ (mapped to dist/production)
- https://neomjs.com/apps/portal/index.html (dev mode)
- https://neomjs.com/dist/development/apps/portal/index.html
- https://neomjs.com/dist/esm/apps/portal/index.html
- https://neomjs.com/dist/production/apps/portal/index.html

`;

    const topLevelRoutes = allRoutes.filter(route => route.category === 'top-level');
    const exampleRoutes  = allRoutes.filter(route => route.category === 'file');
    const contentRoutes  = allRoutes.filter(route => route.category === 'tree');

    content += `## main\n\n`;
    const topLevelUrls = topLevelRoutes.map(route => {
        const name  = route.id.substring(1).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const url   = new URL(buildRouteFromId(route.id, null, false), baseUrl).toString();
        return `- [${name}](${url})`;
    });
    content += topLevelUrls.join('\n') + '\n\n';

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
        content += `## ${folder}\n\n`;
        const urls = topLevelFolders[folder].map(node => {
            const route = buildRouteFromId(node.id, basePath, false);
            const url   = new URL(route, baseUrl).toString();
            return `- [${node.name}](${url})`;
        });
        content += urls.join('\n') + '\n\n';
    }

    if (exampleRoutes.length > 0) {
        content += `## Demo Apps and Examples\n\n`;
        const exampleUrls = exampleRoutes.map(route => {
            const url   = new URL(route.id, baseUrl).toString();
            return `- [${route.name}](${url})`;
        });
        content += exampleUrls.join('\n') + '\n\n';
    }

    return content;
}

async function runCli() {
    const program = new Command(); // Initialize commander

    program
        .name('generate-seo-files')
        .description('Generates sitemap.xml and llms.txt for SEO purposes.')
        .option('-f, --format <type>', 'Output format: array, objects, urls, xml, llms')
        .option('--base-url <url>', 'Absolute base URL (e.g., https://neomjs.com)')
        .option('--base-path <path>', 'Base path for content routes')
        .option('-o, --output <path>', 'Output file path')
        .option('--no-lastmod', 'Exclude <lastmod> tags from sitemap.xml')
        .option('--no-top-level', 'Exclude top-level routes');

    program.parse(process.argv);

    const programOpts     = program.opts();
    const format          = (programOpts.format || 'array').toLowerCase();
    const baseUrl         = programOpts.baseUrl;
    const basePath        = programOpts.basePath || DEFAULT_BASE_PATH;
    const output          = programOpts.output;
    const includeLastmod  = programOpts.noLastmod === undefined ? true : !programOpts.noLastmod;
    const includeTopLevel = programOpts.noTopLevel === undefined ? true : !programOpts.noTopLevel;


    let outputContent;

    switch (format) {
        case 'array': {
            const routes  = await getContentRoutes({basePath, includeTopLevel});
            outputContent = JSON.stringify(routes, null, 2);
            break;
        }
        case 'objects': {
            const routes  = await getContentRouteObjects({basePath, includeTopLevel});
            outputContent = JSON.stringify(routes, null, 2);
            break;
        }
        case 'urls': {
            const urls    = await getContentUrls({baseUrl, basePath, includeTopLevel});
            outputContent = JSON.stringify(urls, null, 2);
            break;
        }
        case 'xml': {
            outputContent = await getSitemapXml({baseUrl, basePath, includeLastmod, includeTopLevel});
            break;
        }
        case 'llms':
        case 'llms.txt': {
            outputContent = await getLlmsTxt({baseUrl, basePath, includeTopLevel});
            break;
        }
        default:
            throw new Error(`Unsupported format "${format}". Supported formats: array, objects, urls, xml, llms.`);
    }

    if (output) {
        const outputPath = path.resolve(ROOT_DIR, output);
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, outputContent);
        console.log(`Successfully wrote output to ${output}`);
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
    getContentRouteObjects,
    getContentUrls,
    getSitemapXml,
    getLlmsTxt
};
