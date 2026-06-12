import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {execFileSync}  from 'child_process';
import {fileURLToPath} from 'url';
import fg              from 'fast-glob';
import semver          from 'semver';
import {sanitizeInput} from '../../util/sanitizer.mjs';

const ROOT_DIR          = process.cwd();
const LEARN_DIR         = path.resolve(ROOT_DIR, 'learn');
const PORTAL_DIR        = path.resolve(ROOT_DIR, 'apps/portal');
const TREE_FILE_PATH    = path.join(LEARN_DIR, 'tree.json');
// Location of the JSON index we will generate in the next step
const RELEASES_PATH     = path.resolve(PORTAL_DIR, 'resources/data/releases.json');
const DEFAULT_BASE_PATH = '/learn';
const GIT_LOG_CHUNK_SIZE = 200;
const STATUS_RENAME_CODES = new Set(['R', 'C']);
const RELEASE_NOTE_NEO_GITHUB_SOURCE_LINK_PATTERN = /https:\/\/github\.com\/neomjs\/neo\/(?:blob|tree)\/([^/\s)]+)\/[^\s)]+/g;
const RELEASE_NOTE_DISALLOWED_SOURCE_REF_PATTERN  = /^(?:main|v\d+(?:\.\d+){0,2}(?:[-.\w]*)?)$/;

// Top-level routes that don't map to content files
const TOP_LEVEL_ROUTES = [
    '/about-us',
    '/news', // Renamed from /blog
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
    ['/news'    , 0.9], // Boosted Priority
    ['/about-us', 0.7],
    ['/services', 0.7],

    // Identity apex: organism / Agent OS / AI engineering team
    ['benefits/Introduction'                        , 0.9],
    ['benefits/ArchitectureOverview'                , 1.0],
    ['benefits/AIEngineeringTeam'                   , 1.0],
    ['benefits/AgentMemory'                         , 1.0],
    ['benefits/SelfEvolution'                       , 1.0],
    ['benefits/AgentOSOnYourCodebase'               , 1.0],
    ['benefits/DeployingTheAgentOS'                 , 1.0],

    // Agent OS guide cluster
    ['agentos/StrategicWorkflows'                   , 1.0],
    ['agentos/SwarmIntelligence'                    , 1.0],
    ['agentos/ProgressiveDisclosureSkills'          , 0.9],
    ['agentos/DreamPipeline'                        , 1.0],
    ['agentos/ConceptOntology'                      , 0.9],
    ['agentos/NeuralLink'                           , 1.0],
    ['agentos/KnowledgeBase'                        , 1.0],
    ['agentos/MemoryCore'                           , 1.0],
    ['agentos/GitHubWorkflow'                       , 0.8],
    ['agentos/CodeExecution'                        , 0.8],
    ['agentos/SharedDeployment'                     , 1.0],
    ['agentos/DeploymentCookbook'                   , 1.0],

    // Cloud deployment: team-ready operational surface
    ['agentos/cloud-deployment/WhyDeploy'           , 1.0],
    ['agentos/cloud-deployment/Overview'            , 1.0],
    ['agentos/cloud-deployment/Day0Tutorial'        , 0.9],
    ['agentos/cloud-deployment/TenantIngestionModel', 0.9],
    ['agentos/cloud-deployment/Security'            , 0.9],
    ['agentos/cloud-deployment/Configuration'       , 0.8],
    ['agentos/cloud-deployment/HookWiring'          , 0.8],
    ['agentos/cloud-deployment/PipelineWiring'      , 0.8],
    ['agentos/cloud-deployment/CustomSources'       , 0.7],
    ['agentos/cloud-deployment/CustomParsers'       , 0.7],
    ['agentos/cloud-deployment/MigrationPath'       , 0.7],

    // Body/runtime benefits
    ['benefits/ObjectPermanence'                    , 0.9],
    ['benefits/JSONFirstUIs'                        , 0.9],
    ['benefits/OffTheMainThread'                    , 0.9],
    ['benefits/FourEnvironments'                    , 0.9],
    ['benefits/ConfigSystem'                        , 0.9],
    ['benefits/Quick'                               , 0.9],
    ['benefits/RPCLayer'                            , 0.9],
    ['benefits/Speed'                               , 0.9],
    ['benefits/MultiWindow'                         , 0.9],
    ['benefits/Effort'                              , 0.8],
    ['benefits/FormsEngine'                         , 0.8],
    ['benefits/Features'                            , 0.8],

    // High-value implementation guides
    ['guides/fundamentals/CodebaseOverview'         , 1.0],
    ['guides/mcp/Introduction'                      , 1.0], // AI Priority
    ['guides/mcp/NeuralLink'                        , 1.0], // AI Priority

    ['blog/context-engineering-done-right'          , 0.9],
    ['blog/ai-native-platform-answers-questions'    , 0.9],
    ['blog/v10-deep-dive-state-provider'            , 0.9],
    ['blog/benchmarking-frontends-2025'             , 0.9],
    ['blog/v10-deep-dive-vdom-revolution'           , 0.9],
    ['blog/v10-deep-dive-functional-components'     , 0.9],
    ['blog/v10-deep-dive-reactivity'                , 0.9],
    ['blog/v10-post1-love-story'                    , 0.9],
    ['blog/json-blueprints-and-shared-workers'      , 0.9],

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
    ['guides/datahandling/Grids'                      , 0.8],
    ['guides/userinteraction/Forms'                   , 0.8]
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
 * Resolves the recency-tiered priority for a release-note version.
 *
 * Anchored on the newest release-note major so the tiers self-maintain as new majors ship.
 * Returns `DEFAULT_PRIORITY` when the version is unparseable or the anchor is unknown.
 *
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
 * Gets the priority for a given route ID.
 * @param {String} id The route ID
 * @returns {Number} The priority value
 */
function getPriority(id) {
    if (id.startsWith('/news/releases/')) {
        return getReleaseNotePriority(id.slice('/news/releases/'.length));
    }

    if (id.startsWith('/news/tickets/')) {
        return 0.5;
    }

    if (id.startsWith('/news/pulls/')) {
        return 0.6;
    }

    if (id.startsWith('/news/discussions/')) {
        return 0.4;
    }

    // Normalize ID by removing .md extension if present
    const cleanId = id.endsWith('.md') ? id.slice(0, -3) : id;
    return PRIORITIES.get(cleanId) || DEFAULT_PRIORITY;
}

/**
 * Normalizes an absolute file path into a git pathspec.
 * @param {String} filePath Absolute file or directory path
 * @returns {String} Repository-relative POSIX path
 */
function getGitPath(filePath) {
    return path.relative(ROOT_DIR, filePath).split(path.sep).join('/');
}

/**
 * @summary Finds Neo source links that point at mutable or non-existent release refs.
 * @param {String} content Markdown content to inspect
 * @returns {String[]} Matched `github.com/neomjs/neo/(blob|tree)/<main|vX...>/...` links
 */
export function getDisallowedReleaseNoteGithubLinks(content='') {
    return Array.from(content.matchAll(RELEASE_NOTE_NEO_GITHUB_SOURCE_LINK_PATTERN))
        .filter(match => RELEASE_NOTE_DISALLOWED_SOURCE_REF_PATTERN.test(match[1]))
        .map(match => match[0]);
}

/**
 * @summary Fails release-note route generation before non-canonical Neo source links become SEO-visible.
 * @param {Object} options
 * @param {String} options.filePath Absolute release-note markdown path
 * @param {String} options.content Markdown content to inspect
 */
export function assertStableReleaseNoteGithubLinks({filePath, content}) {
    const links = getDisallowedReleaseNoteGithubLinks(content);

    if (links.length === 0) {
        return;
    }

    const fileLabel = filePath ? getGitPath(filePath) : 'unknown release-note source';
    throw new Error([
        `Release-note SEO route source "${fileLabel}" contains non-canonical Neo source links.`,
        'Use the canonical dev branch for live public Neo source links; immutable commit permalinks are allowed:',
        ...links.map(link => `- ${link}`)
    ].join('\n'));
}

/**
 * Checks whether path-limited git history is reliable for sitemap lastmod data.
 * Shallow repositories report the shallow root commit for every path, which
 * turns hourly data-sync commits into site-wide lastmod churn.
 * @returns {Boolean} True when git path history can be trusted
 */
function hasReliableGitHistory() {
    try {
        const isShallow = execFileSync(
            'git',
            ['rev-parse', '--is-shallow-repository'],
            {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']}
        ).trim();

        return isShallow !== 'true';
    } catch {
        return false;
    }
}

/**
 * Gets working-tree paths changed relative to HEAD.
 * @returns {Set<String>} Repository-relative POSIX paths
 */
function getChangedGitPaths() {
    const paths = new Set();

    try {
        const result = execFileSync(
            'git',
            ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
            {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']}
        );

        const entries = result.split('\0');

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];

            if (!entry) {
                continue;
            }

            const status = entry.slice(0, 2);
            let gitPath  = entry.slice(3);

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
 * Formats a date as a sitemap-compatible timestamp.
 * @param {Date} date The date to format
 * @returns {String}
 */
function formatLastmodDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Gets the newest mtime for a changed source path.
 * @param {String} gitPath Repository-relative POSIX path
 * @param {Set<String>} changedGitPaths Changed path set from git status
 * @param {Boolean} isDirectory True if gitPath represents a directory
 * @returns {String|null}
 */
function getChangedLastmod(gitPath, changedGitPaths, isDirectory=false) {
    let lastmod = null;

    function updateLastmod(changedGitPath) {
        try {
            const filePath = path.join(ROOT_DIR, ...changedGitPath.split('/'));
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
 * Splits an array into chunks that stay below shell argument limits.
 * @param {Array} items Items to chunk
 * @param {Number} size Maximum chunk size
 * @returns {Array<Array>}
 */
function chunkArray(items, size) {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

/**
 * Gets last modified dates for multiple files in a batch.
 * @param {String[]} filePaths - Array of absolute file paths
 * @returns {Map<String, String>} Map of filePath -> ISO date string
 */
function getGitLastModifiedBatch(filePaths) {
    const dateMap = new Map();
    const uniquePaths = Array.from(new Set(filePaths));

    if (uniquePaths.length === 0) {
        return dateMap;
    }

    if (!hasReliableGitHistory()) {
        console.warn('Git history is shallow or unavailable; preserving existing sitemap lastmod values where available.');
        return dateMap;
    }

    const pathDescriptors = uniquePaths.map(filePath => {
        let isDirectory = false;

        try {
            isDirectory = fs.statSync(filePath).isDirectory();
        } catch {
            isDirectory = false;
        }

        return {
            filePath,
            gitPath: getGitPath(filePath),
            isDirectory
        };
    });

    try {
        for (const chunk of chunkArray(pathDescriptors, GIT_LOG_CHUNK_SIZE)) {
            try {
                const filePathByGitPath = new Map(
                    chunk
                        .filter(({isDirectory}) => !isDirectory)
                        .map(({filePath, gitPath}) => [gitPath, filePath])
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
                    {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']}
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
 * Reads existing sitemap lastmod values for stable fallback behavior.
 * @param {String} sitemapPath Absolute path to the existing sitemap.xml
 * @returns {Promise<Map<String, String>>} Map of loc URL -> ISO date string
 */
async function getExistingSitemapLastmodMap(sitemapPath) {
    const lastmodMap = new Map();

    if (!sitemapPath || !(await fs.pathExists(sitemapPath))) {
        return lastmodMap;
    }

    const sitemap = await fs.readFile(sitemapPath, 'utf-8');
    const urlRegex = /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<lastmod>(.*?)<\/lastmod>[\s\S]*?<\/url>/g;

    for (const match of sitemap.matchAll(urlRegex)) {
        lastmodMap.set(match[1], match[2]);
    }

    return lastmodMap;
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
            filePath,
            id      : `/${file}`,
            name    : titleMatch ? titleMatch[1] : getNameFromExamplePath(file)
        };
    }));
}

/**
 * Collects all release notes by recursively scanning the markdown directory, including chunk-N archives.
 * @returns {Promise<Array<{id: String, filePath: String, name: String}>>}
 */
async function collectReleaseRoutes() {
    const files = await fg('resources/content/release-notes/**/*.md', {
        cwd    : ROOT_DIR,
        ignore : ['**/node_modules/**']
    });

    const releases = await Promise.all(files.map(async file => {
        const filePath = path.resolve(ROOT_DIR, file);
        const content  = await fs.readFile(filePath, 'utf-8');
        const fileName = path.basename(file, '.md'); // e.g., 'v12.1.0'
        const version  = fileName.startsWith('v') ? fileName.substring(1) : fileName;

        assertStableReleaseNoteGithubLinks({filePath, content});

        return {
            category: 'release-notes',
            filePath,
            id      : `/news/releases/${version}`,
            version : version
        };
    }));

    const sorted = releases.sort((a, b) => {
        const vA = semver.valid(a.version) || semver.coerce(a.version)?.version;
        const vB = semver.valid(b.version) || semver.coerce(b.version)?.version;
        if (vA && vB) {
            return semver.rcompare(vA, vB);
        }
        return 0;
    });

    // Anchor the recency tiers on the newest release-note major (see getReleaseNotePriority).
    const majors = releases.map(release => semver.coerce(release.version)?.major).filter(major => major != null);

    maxReleaseMajor = majors.length ? Math.max(...majors) : null;

    return sorted;
}

/**
 * Collects all github issues by scanning the active and archive markdown directories.
 * @returns {Promise<Array<{id: String, filePath: String}>>}
 */
async function collectIssueRoutes() {
    const files = await fg([
        'resources/content/issues/**/*.md',
        'resources/content/archive/issues/**/issue-*.md'
    ], {
        cwd    : ROOT_DIR,
        ignore : ['**/node_modules/**']
    });

    const issues = files.map(file => {
        const filePath = path.resolve(ROOT_DIR, file);
        const fileName = path.basename(file, '.md'); // e.g., 'issue-8186'
        const issueNumberStr = fileName.startsWith('issue-') ? fileName.substring(6) : fileName;
        const issueNumber = parseInt(issueNumberStr, 10);

        return {
            category: 'tickets',
            filePath,
            id      : `/news/tickets/${issueNumberStr}`,
            issueNum: isNaN(issueNumber) ? 0 : issueNumber
        };
    });

    return issues.sort((a, b) => b.issueNum - a.issueNum);
}

/**
 * Collects all GitHub pull requests by scanning the active and archive markdown directories.
 * @returns {Promise<Array<{id: String, filePath: String, pullNum: Number}>>}
 */
async function collectPullRoutes() {
    const files = await fg([
        'resources/content/pulls/**/pr-*.md',
        'resources/content/archive/pulls/**/pr-*.md'
    ], {
        cwd    : ROOT_DIR,
        ignore : ['**/node_modules/**']
    });

    const pulls = files.map(file => {
        const filePath = path.resolve(ROOT_DIR, file);
        const fileName = path.basename(file, '.md');
        const pullNumberStr = fileName.startsWith('pr-') ? fileName.substring(3) : fileName;
        const pullNumber = parseInt(pullNumberStr, 10);

        return {
            category: 'pull-requests',
            filePath,
            id      : `/news/pulls/${pullNumberStr}`,
            pullNum : isNaN(pullNumber) ? 0 : pullNumber
        };
    });

    return pulls.sort((a, b) => b.pullNum - a.pullNum);
}

/**
 * Collects all GitHub discussions by scanning the active and archive markdown directories.
 * @returns {Promise<Array<{id: String, filePath: String, discussionNum: Number}>>}
 */
async function collectDiscussionRoutes() {
    const files = await fg([
        'resources/content/discussions/**/discussion-*.md',
        'resources/content/archive/discussions/**/discussion-*.md'
    ], {
        cwd    : ROOT_DIR,
        ignore : ['**/node_modules/**']
    });

    const discussions = files.map(file => {
        const filePath = path.resolve(ROOT_DIR, file);
        const fileName = path.basename(file, '.md');
        const discussionNumberStr = fileName.startsWith('discussion-') ? fileName.substring(11) : fileName;
        const discussionNumber = parseInt(discussionNumberStr, 10);

        return {
            category     : 'discussions',
            discussionNum: isNaN(discussionNumber) ? 0 : discussionNumber,
            filePath,
            id           : `/news/discussions/${discussionNumberStr}`
        };
    });

    return discussions.sort((a, b) => b.discussionNum - a.discussionNum);
}

/**
 * Collects all routes (top-level + content routes).
 * @returns {Promise<Array<{id: String, filePath: String|null}>>}
 */
async function collectAllRoutes() {
    const [
        topLevelRoutes,
        contentRoutes,
        exampleRoutes,
        releaseRoutes,
        issueRoutes,
        pullRoutes,
        discussionRoutes
    ] = await Promise.all([
        collectTopLevelRoutes(),
        collectRoutesFromTree(),
        collectExampleRoutes(),
        collectReleaseRoutes(),
        collectIssueRoutes(),
        collectPullRoutes(),
        collectDiscussionRoutes()
    ]);

    return [
        ...topLevelRoutes,
        ...contentRoutes,
        ...exampleRoutes,
        ...releaseRoutes,
        ...issueRoutes,
        ...pullRoutes,
        ...discussionRoutes
    ];
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
 * @param {String} [options.existingSitemapPath] Existing sitemap path for stable lastmod fallback
 * @returns {Promise<String>}
 */
export async function getSitemapXml(options={}) {
    const {
              baseUrl,
              basePath = DEFAULT_BASE_PATH,
              existingSitemapPath,
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
    let changedGitPaths    = new Set();
    let existingLastmodMap = new Map();
    let lastModMap         = new Map();

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

        changedGitPaths = getChangedGitPaths();
        lastModMap = getGitLastModifiedBatch(filePaths);

        if (existingSitemapPath) {
            existingLastmodMap = await getExistingSitemapLastmodMap(existingSitemapPath);
            changedGitPaths.delete(getGitPath(existingSitemapPath));
        }
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
            const key         = category === 'file' ? path.dirname(filePath) : filePath;
            const isDirectory = category === 'file';
            const gitPath     = getGitPath(key);

            const changedLastmod = getChangedLastmod(gitPath, changedGitPaths, isDirectory);

            if (changedLastmod) {
                lastmod = changedLastmod;
            } else {
                lastmod = existingLastmodMap.get(url) || lastModMap.get(key) || null;
            }
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

    // 1. The Dynamic Header: organism apex for LLM crawlers
    let content = `# Neo.mjs: Self-Evolving Software Organism for AI Engineering

> Neo.mjs is a self-evolving software organism: a professional, end-to-end AI engineering team whose cross-model swarm maintains the repository it inhabits.
> Its Brain (/ai) is the Agent OS: Memory Core, Knowledge Base, Native Edge Graph, A2A coordination, GitHub Workflow, DreamService, and Active Hybrid GraphRAG.
> Its Body (/src) is the production multi-threaded application engine: App Worker, VDom Worker, Data Worker, Canvas Worker, SharedWorker, JSON VDOM blueprints, object permanence, and zero-build ES modules.
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

    // 2. The Dynamic Injector: Latest Release Notes
    // This looks for a generated releases.json from the Portal build process
    if (await fs.pathExists(RELEASES_PATH)) {
        try {
            const releases = await fs.readJSON(RELEASES_PATH);

            if (Array.isArray(releases) && releases.length > 0) {
                // Filter out directory nodes (leaf nodes only)
                const actualReleases = releases.filter(r => r.isLeaf !== false && r.id);

                if (actualReleases.length > 0) {
                    content += `## Latest Updates\n\n`;
                    // Take top 5 releases
                    actualReleases.slice(0, 5).forEach(release => {
                        // Link natively to the markdown file on our proxy /raw/*
                        const version = release.id;
                        const date    = release.date ? ` (${release.date.split('T')[0]})` : '';
                        const title   = release.title || 'Update';

                        // Maps to raw/news/releases/{version}.md
                        const url = new URL(`raw/news/releases/${version}.md`, baseUrl).toString();

                        content += `- [v${version}${date}: ${title}](${url})\n`;
                    });
                    content += `\n`;
                }
            }
        } catch (e) {
            console.warn('Found releases.json but failed to parse it. Skipping "Latest Updates" section.');
        }
    }

    const topLevelRoutes = allRoutes.filter(route => route.category === 'top-level');
    const releaseRoutes  = allRoutes.filter(route => route.category === 'release-notes');
    const ticketRoutes   = allRoutes.filter(route => route.category === 'tickets');
    const pullRoutes       = allRoutes.filter(route => route.category === 'pull-requests');
    const discussionRoutes = allRoutes.filter(route => route.category === 'discussions');
    const exampleRoutes    = allRoutes.filter(route => route.category === 'file');
    const contentRoutes    = allRoutes.filter(route => route.category === 'tree');

    content += `## Main Pages\n\n`;
    const topLevelUrls = topLevelRoutes.map(route => {
        // Beautify route name: /about-us -> About Us
        const name  = route.id.substring(1).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

        let urlStr;
        if (route.filePath && route.filePath.endsWith('.md')) {
            const relativePath = path.relative(ROOT_DIR, route.filePath).split(path.sep).join('/');
            urlStr = new URL(`raw/${relativePath}`, baseUrl).toString();
        } else {
            const routeStr = buildRouteFromId(route.id, null, false);
            urlStr = new URL(routeStr, baseUrl).toString();
        }

        return `- [${name}](${urlStr})`;
    });
    content += topLevelUrls.join('\n') + '\n\n';

    if (exampleRoutes.length > 0) {
        content += `## Demo Apps and Examples\n\n`;
        const exampleUrls = exampleRoutes.map(route => {
            const url   = new URL(route.id, baseUrl).toString();
            return `- [${route.name}](${url})`;
        });
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
            const name = `v${route.version}`;
            const cleanPath = route.id.startsWith('/') ? route.id.substring(1) : route.id;
            const urlStr = new URL(`raw/${cleanPath}.md`, baseUrl).toString();
            return `- [${name}](${urlStr})`;
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
        // Capitalize folder header
        const header = folder.charAt(0).toUpperCase() + folder.slice(1);
        content += `## ${header}\n\n`;
        const urls = topLevelFolders[folder].map(node => {
            let urlStr;
            if (node.filePath && node.filePath.endsWith('.md')) {
                // Ensure cross-platform path resolution matches the expected web path
                const relativePath = path.relative(ROOT_DIR, node.filePath).split(path.sep).join('/');
                urlStr = new URL(`raw/${relativePath}`, baseUrl).toString();
            } else {
                const route = buildRouteFromId(node.id, basePath, false);
                urlStr = new URL(route, baseUrl).toString();
            }
            return `- [${node.name}](${urlStr})`;
        });
        content += urls.join('\n') + '\n\n';
    }



    if (ticketRoutes.length > 0) {
        content += `## GitHub Tickets\n\n`;
        content += `Here you find historical technical discussions and GitHub issues.\n\n`;
        const mappedUrls = ticketRoutes.map(route => {
            const name = `Ticket #${route.issueNum}`;
            const cleanPath = route.id.startsWith('/') ? route.id.substring(1) : route.id;
            const urlStr = new URL(`raw/${cleanPath}.md`, baseUrl).toString();
            return `- [${name}](${urlStr})`;
        });
        content += mappedUrls.join('\n') + '\n\n';
    }

    if (pullRoutes.length > 0) {
        content += `## GitHub Pull Requests\n\n`;
        content += `Here you find problem-to-solution records from Neo.mjs pull requests.\n\n`;
        const mappedUrls = pullRoutes.map(route => {
            const name = `Pull Request #${route.pullNum}`;
            const cleanPath = route.id.startsWith('/') ? route.id.substring(1) : route.id;
            const urlStr = new URL(`raw/${cleanPath}.md`, baseUrl).toString();
            return `- [${name}](${urlStr})`;
        });
        content += mappedUrls.join('\n') + '\n\n';
    }

    if (discussionRoutes.length > 0) {
        content += `## GitHub Discussions\n\n`;
        content += `Here you find Ideation Sandbox and architectural discussion records.\n\n`;
        const mappedUrls = discussionRoutes.map(route => {
            const name = `Discussion #${route.discussionNum}`;
            const cleanPath = route.id.startsWith('/') ? route.id.substring(1) : route.id;
            const urlStr = new URL(`raw/${cleanPath}.md`, baseUrl).toString();
            return `- [${name}](${urlStr})`;
        });
        content += mappedUrls.join('\n') + '\n\n';
    }

    return content;
}

async function runCli() {
    const program = new Command(); // Initialize commander

    program
        .name('generate-seo-files')
        .description('Generates sitemap.xml and llms.txt for SEO purposes.')
        .option('-f, --format <type>', 'Output format: array, objects, urls, xml, llms', sanitizeInput)
        .option('--base-url <url>',    'Absolute base URL (e.g., https://neomjs.com)',   sanitizeInput)
        .option('--base-path <path>',  'Base path for content routes',                   sanitizeInput)
        .option('-o, --output <path>', 'Output file path',                               sanitizeInput)
        .option('--no-lastmod',        'Exclude <lastmod> tags from sitemap.xml')
        .option('--no-top-level',      'Exclude top-level routes');

    program.parse(process.argv);

    const programOpts     = program.opts();
    const format          = (programOpts.format || 'array').toLowerCase();
    const baseUrl         = programOpts.baseUrl;
    const basePath        = programOpts.basePath || DEFAULT_BASE_PATH;
    const output          = programOpts.output;
    const outputPath      = output ? path.resolve(ROOT_DIR, output) : null;
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
            outputContent = await getSitemapXml({
                baseUrl,
                basePath,
                existingSitemapPath: outputPath,
                includeLastmod,
                includeTopLevel
            });
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
    getDisallowedReleaseNoteGithubLinks,
    getSitemapXml,
    getLlmsTxt,
    assertStableReleaseNoteGithubLinks
};
