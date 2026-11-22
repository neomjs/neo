import {spawnSync}                        from 'node:child_process';
import {existsSync, statSync, utimesSync} from 'node:fs';
import fg                                 from 'fast-glob';
import fs                                 from 'fs-extra';
import path                               from 'node:path';
import {normalizeIsoDateOnly}             from './gitLastmod.mjs';

/**
 * @module buildScripts.docs.seo.learnSpokes
 * @summary Composes federated spoke `docs/public-manifest.json` guides into a target `learn/` tree,
 * resolves `.spoke-lastmod.json` and preserved file `mtime` fallbacks for `.git`-less builds, and
 * detects unlisted public `.md` files under `learn/`.
 */

export const EXPECTED_MANIFEST_SCHEMA = 'public-manifest.v1';
export const SPOKE_LASTMOD_FILENAME   = '.spoke-lastmod.json';

export const NON_TREE_LEARN_EXCLUDED_DIRS = Object.freeze([
    'learn/blog/',
    'learn/agentos/decisions/',
    'learn/agentos/measurements/',
    'learn/agentos/incidents/',
    'learn/agentos/process/'
]);

export const NON_TREE_LEARN_EXCLUDED_FILES = new Set([
    'learn/README.md',
    'learn/agentos/AGENTS_ATLAS.md'
]);

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /(`[^`\n]+`)/g;
const LINK_TARGET_RE = /\]\(([^()[\]\s]+)\)/g;
const EXTERNAL_RE    = /^(?:https?:|mailto:)/i;
const SHA40_RE       = /^[0-9a-f]{40}$/;

function asDirPrefix(dir) {
    return dir.endsWith('/') ? dir : `${dir}/`;
}

function isNormalizedRelPath(value) {
    return typeof value === 'string' && value !== '' && value !== '.' && !value.startsWith('/') &&
        value !== '..' && !value.startsWith('../') && path.posix.normalize(value) === value;
}

/**
 * @summary Reads normalized `YYYY-MM-DD` spoke commit dates keyed by `/learn/...` route from `learn/.spoke-lastmod.json`.
 * @param {String} learnDir
 * @returns {Promise<Map<String, String>>}
 */
export async function readSpokeLastmodMap(learnDir) {
    const map = new Map();

    if (!learnDir) {
        return map;
    }

    const filePath = path.join(learnDir, SPOKE_LASTMOD_FILENAME);

    if (!(await fs.pathExists(filePath))) {
        return map;
    }

    const raw = await fs.readJSON(filePath).catch(() => null);

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return map;
    }

    for (const [key, value] of Object.entries(raw)) {
        const iso = normalizeIsoDateOnly(String(value || ''));

        if (!iso) {
            continue;
        }

        const route = key.startsWith('/') ? key : `/learn/${key.replace(/\.md$/i, '')}`;
        map.set(route, iso);
    }

    return map;
}

/**
 * @summary Reads a file's preserved filesystem `mtime` as a `YYYY-MM-DD` date when `.git` history is unavailable.
 * @param {String} filePath
 * @returns {String|null}
 */
export function getPreservedFileLastmod(filePath) {
    if (!filePath || !existsSync(filePath)) {
        return null;
    }

    try {
        const mtime = statSync(filePath).mtime;
        return Number.isNaN(mtime.getTime()) ? null : mtime.toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

/**
 * @summary Finds public `.md` files under `learn/` that are absent from `learn/tree.json`.
 * @param {Object} [options={}]
 * @param {String} [options.learnDir]
 * @param {String} [options.root=process.cwd()]
 * @param {String} [options.treeFilePath]
 * @returns {Promise<String[]>}
 */
export async function findUnlistedLearnMarkdownFiles(options={}) {
    const {
        root         = process.cwd(),
        learnDir     = path.resolve(root, 'learn'),
        treeFilePath = path.join(learnDir, 'tree.json')
    } = options;

    if (!(await fs.pathExists(treeFilePath)) || !(await fs.pathExists(learnDir))) {
        return [];
    }

    const tree      = await fs.readJSON(treeFilePath);
    const nodes     = Array.isArray(tree) ? tree : (Array.isArray(tree?.data) ? tree.data : []);
    const treeFiles = new Set(
        nodes
            .filter(node => node?.id && node.isLeaf !== false && !node.route)
            .map(node => `learn/${String(node.id).replace(/^\/+/, '')}.md`)
    );

    const diskFiles = await fg('**/*.md', {
        cwd      : learnDir,
        onlyFiles: true,
        ignore   : ['**/node_modules/**']
    });

    return diskFiles
        .map(rel => `learn/${rel.split(path.sep).join('/')}`)
        .filter(rel =>
            !NON_TREE_LEARN_EXCLUDED_FILES.has(rel) &&
            !NON_TREE_LEARN_EXCLUDED_DIRS.some(prefix => rel.startsWith(prefix)) &&
            !treeFiles.has(rel)
        )
        .sort((a, b) => a.localeCompare(b));
}

function readGitHeadSha(checkoutDir) {
    if (!existsSync(path.resolve(checkoutDir, '.git'))) {
        return null;
    }

    const res = spawnSync('git', ['-C', checkoutDir, 'rev-parse', 'HEAD'], {encoding: 'utf-8'});

    if (res.status === 0) {
        const sha = res.stdout.trim();
        if (SHA40_RE.test(sha)) {
            return sha;
        }
    }

    return null;
}

function readGitCommitEpoch(checkoutDir, relFile) {
    if (existsSync(path.resolve(checkoutDir, '.git'))) {
        const res = spawnSync('git', ['-C', checkoutDir, 'log', '-1', '--format=%ct', '--', relFile], {encoding: 'utf-8'});

        if (res.status === 0) {
            const sec = Number.parseInt(res.stdout.trim(), 10);
            if (Number.isFinite(sec) && sec > 0) {
                return sec;
            }
        }
    }

    const absPath = path.resolve(checkoutDir, relFile);

    if (existsSync(absPath)) {
        const mtimeSec = Math.floor(statSync(absPath).mtimeMs / 1000);
        return mtimeSec > 0 ? mtimeSec : null;
    }

    return null;
}

function resolveGitHubObjectKind(checkoutDir, resolvedAbsPath, spokeRelPath, rawTarget) {
    if (rawTarget.endsWith('/')) {
        return 'tree';
    }
    if (existsSync(resolvedAbsPath)) {
        return statSync(resolvedAbsPath).isDirectory() ? 'tree' : 'blob';
    }
    if (existsSync(path.resolve(checkoutDir, '.git'))) {
        const res = spawnSync('git', ['-C', checkoutDir, 'cat-file', '-t', `HEAD:${spokeRelPath}`], {encoding: 'utf-8'});
        if (res.status === 0 && res.stdout.trim() === 'tree') {
            return 'tree';
        }
    }
    return 'blob';
}

function rewriteSpokeSourceLinks({markdown, srcFile, checkoutDir, spoke, commitRef, sourceRoots, admittedAbsFiles}) {
    if (!sourceRoots.length) {
        return markdown;
    }

    let fence = null;

    return String(markdown).split('\n').map(rawLine => {
        const hasCr = rawLine.endsWith('\r');
        const line  = hasCr ? rawLine.slice(0, -1) : rawLine;
        const match = FENCE_RE.exec(line);

        if (fence) {
            if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
                fence = null;
            }
            return rawLine;
        }

        if (match) {
            fence = match[1];
            return rawLine;
        }

        const rewritten = line.split(INLINE_CODE_RE).map((segment, index) => {
            if (index % 2 === 1) {
                return segment;
            }

            return segment.replace(LINK_TARGET_RE, (fullMatch, rawTarget) => {
                const cleanTarget = rawTarget.split(/[?#]/)[0];
                const suffix      = rawTarget.slice(cleanTarget.length);

                if (!cleanTarget || EXTERNAL_RE.test(rawTarget) || rawTarget.startsWith('#') || rawTarget.startsWith('/')) {
                    return fullMatch;
                }

                const resolved = path.resolve(path.dirname(srcFile), cleanTarget);

                if (admittedAbsFiles.has(resolved) || admittedAbsFiles.has(`${resolved}.md`)) {
                    return fullMatch;
                }

                const spokeRelPath = path.relative(checkoutDir, resolved).split(path.sep).join('/');

                if (!spokeRelPath || spokeRelPath === '..' || spokeRelPath.startsWith('../')) {
                    return fullMatch;
                }

                if (sourceRoots.some(dir => `${spokeRelPath}/`.startsWith(dir))) {
                    const kind = resolveGitHubObjectKind(checkoutDir, resolved, spokeRelPath, cleanTarget);
                    return `](https://github.com/${spoke}/${kind}/${commitRef}/${spokeRelPath}${suffix})`;
                }

                return fullMatch;
            });
        }).join('');

        return hasCr ? `${rewritten}\r` : rewritten;
    }).join('\n');
}

function resolveHubParentId(hubFoldersByLowerId, declaredParentId, spokeName) {
    const folder = hubFoldersByLowerId.get(String(declaredParentId || '').toLowerCase());

    if (!folder) {
        throw new Error(`[learn-spokes] Spoke "${spokeName}" declares unknown hub parentId "${declaredParentId}".`);
    }

    return folder.id;
}

function extractSubtree(treeData, rootFolderId, targetHubParentId, groupName) {
    const rootFolder = treeData.find(node => node.id === rootFolderId && node.isLeaf === false);

    if (!rootFolder) {
        throw new Error(`[learn-spokes] Missing spoke tree folder "${rootFolderId}".`);
    }

    const includedIds = new Set([rootFolderId]);
    const out         = [{
        ...rootFolder,
        name    : groupName,
        parentId: targetHubParentId,
        isLeaf  : false,
        ...(targetHubParentId !== 'Benefits' ? {collapsed: true} : {})
    }];

    let added = true;
    while (added) {
        added = false;
        for (const node of treeData) {
            if (!includedIds.has(node.id) && node.parentId && includedIds.has(node.parentId)) {
                includedIds.add(node.id);
                added = true;
            }
        }
    }

    for (const node of treeData) {
        if (node.id !== rootFolderId && includedIds.has(node.id)) {
            out.push({...node});
        }
    }

    return out;
}

/**
 * @summary Composes the hub `learn/tree.json` with one or more `public-manifest.v1` spoke checkouts,
 * enforcing fail-closed node-id and route collision guards and optionally materializing spoke guides
 * plus `.spoke-lastmod.json` into `targetLearnDir`.
 * @param {Object} options
 * @param {Object} [options.baseTree]
 * @param {String} [options.pristineLearnDir]
 * @param {String|null} [options.seoJsonPath=null]
 * @param {Array<{spoke: String, checkoutDir: String, commit?: String}>} options.spokeCheckouts
 * @param {String|null} [options.targetLearnDir=null]
 * @returns {Promise<{composedTree: {data: Object[]}, routeLastmods: Object<String, String>, spokeLeafCount: Number, totalLeafCount: Number, totalMarkdownLeafCount: Number}>}
 */
export async function composeLearnSpokes({
    baseTree         = null,
    pristineLearnDir = null,
    seoJsonPath      = null,
    spokeCheckouts   = [],
    targetLearnDir   = null
}={}) {
    const resolvedBaseTree = baseTree || (
        pristineLearnDir ? await fs.readJSON(path.resolve(pristineLearnDir, 'tree.json')) : null
    );

    if (!resolvedBaseTree || !Array.isArray(resolvedBaseTree.data)) {
        throw new Error('[learn-spokes] baseTree or pristineLearnDir/tree.json must provide a "data" array.');
    }

    const hubFoldersByLowerId = new Map();
    const claimedNodeIds      = new Map();
    const claimedRoutes       = new Map();
    const splicesByHubParent  = new Map();
    const copyPlan            = [];
    const routeLastmods       = {};

    for (const node of resolvedBaseTree.data) {
        if (!node || typeof node.id !== 'string') {
            throw new Error('[learn-spokes] Invalid node in base learn/tree.json.');
        }
        if (claimedNodeIds.has(node.id)) {
            throw new Error(`[learn-spokes] Duplicate hub tree node id "${node.id}".`);
        }
        claimedNodeIds.set(node.id, 'neomjs/neo');

        if (node.isLeaf === false) {
            hubFoldersByLowerId.set(node.id.toLowerCase(), node);
        } else if (!node.route) {
            claimedRoutes.set(`/learn/${node.id}`, 'neomjs/neo');
        }
    }

    let spokeLeafCount = 0;

    for (const spokeSpec of spokeCheckouts) {
        const {spoke, checkoutDir, commit = null} = spokeSpec || {};
        const manifestPath = path.resolve(checkoutDir || '', 'docs/public-manifest.json');

        if (!spoke || !checkoutDir || !(await fs.pathExists(manifestPath))) {
            throw new Error(`[learn-spokes] Missing docs/public-manifest.json for spoke "${spoke}".`);
        }

        const manifest = await fs.readJSON(manifestPath);

        if (manifest?.schema !== EXPECTED_MANIFEST_SCHEMA || manifest?.spoke !== spoke) {
            throw new Error(`[learn-spokes] Invalid public-manifest.v1 header in "${spoke}".`);
        }
        if (!Array.isArray(manifest?.entries) || manifest.entries.length === 0) {
            throw new Error(`[learn-spokes] Spoke "${spoke}" manifest must contain a non-empty entries array.`);
        }

        for (const [field, insideLearn] of [['excludedDirs', true], ['sourceLinkRoots', false]]) {
            const dirs = manifest?.[field];
            if (dirs !== undefined && !(Array.isArray(dirs) && dirs.every(dir => isNormalizedRelPath(dir) && asDirPrefix(dir).startsWith('learn/') === insideLearn))) {
                throw new Error(`[learn-spokes] Spoke "${spoke}" ${field} contains invalid directory entries.`);
            }
        }

        const excludedPrefixes = (manifest.excludedDirs || []).map(asDirPrefix);
        const sourceRoots      = (manifest.sourceLinkRoots || []).map(asDirPrefix);
        const commitRef        = commit || readGitHeadSha(checkoutDir) || 'dev';
        const spokeTree        = await fs.readJSON(path.resolve(checkoutDir, manifest.treeFile || ''));

        if (!Array.isArray(spokeTree?.data)) {
            throw new Error(`[learn-spokes] "${manifest.treeFile}" in "${spoke}" must contain a "data" array.`);
        }

        const spokeLearnRoot = path.resolve(checkoutDir, 'learn');
        const splicedLeaves  = new Map();

        if (manifest.treeMount && !manifest.treeMounts) {
            const {parentId, id: mountId, name: mountName} = manifest.treeMount;
            const hubParentId                              = resolveHubParentId(hubFoldersByLowerId, parentId, spoke);
            const groupNodes                               = [{
                name     : mountName,
                parentId : hubParentId,
                isLeaf   : false,
                id       : mountId,
                collapsed: true
            }];

            for (const node of spokeTree.data) {
                const prefixedId     = `${mountId}/${node.id}`;
                const prefixedParent = node.parentId ? `${mountId}/${node.parentId}` : mountId;
                const cloned         = {...node, id: prefixedId, parentId: prefixedParent};

                groupNodes.push(cloned);
                if (cloned.isLeaf !== false && !cloned.route) {
                    splicedLeaves.set(`learn/${node.id}.md`, `/learn/${prefixedId}`);
                }
            }

            for (const node of groupNodes) {
                const existingOwner = claimedNodeIds.get(node.id);
                if (existingOwner) {
                    throw new Error(`[learn-spokes] Tree node id collision on "${node.id}" between "${existingOwner}" and "${spoke}".`);
                }
                claimedNodeIds.set(node.id, spoke);
            }

            if (!splicesByHubParent.has(hubParentId)) {
                splicesByHubParent.set(hubParentId, []);
            }
            splicesByHubParent.get(hubParentId).push({mountId, nodes: groupNodes});
        } else if (Array.isArray(manifest.treeMounts) && manifest.treeMounts.length > 0) {
            for (const mount of manifest.treeMounts) {
                const hubParentId = resolveHubParentId(hubFoldersByLowerId, mount.parentId, spoke);
                const groupNodes  = extractSubtree(spokeTree.data, mount.id, hubParentId, mount.name);

                for (const node of groupNodes) {
                    const existingOwner = claimedNodeIds.get(node.id);
                    if (existingOwner) {
                        throw new Error(`[learn-spokes] Tree node id collision on "${node.id}" between "${existingOwner}" and "${spoke}".`);
                    }
                    claimedNodeIds.set(node.id, spoke);

                    if (node.isLeaf !== false && !node.route) {
                        splicedLeaves.set(`learn/${node.id}.md`, `/learn/${node.id}`);
                    }
                }

                if (!splicesByHubParent.has(hubParentId)) {
                    splicesByHubParent.set(hubParentId, []);
                }
                splicesByHubParent.get(hubParentId).push({mountId: mount.id, nodes: groupNodes});
            }
        } else {
            throw new Error(`[learn-spokes] Spoke "${spoke}" must declare either "treeMount" or "treeMounts".`);
        }

        if (splicedLeaves.size !== manifest.entries.length) {
            throw new Error(
                `[learn-spokes] Spoke "${spoke}" manifest/tree count mismatch: ${manifest.entries.length} manifest entries vs ${splicedLeaves.size} tree leaves.`
            );
        }

        const admittedAbsFiles = new Set();

        for (const entry of manifest.entries) {
            const normalizedFile = path.posix.normalize(String(entry?.file || ''));

            if (normalizedFile !== entry?.file || !normalizedFile.startsWith('learn/') || !normalizedFile.endsWith('.md') || normalizedFile.includes('..')) {
                throw new Error(`[learn-spokes] Invalid entry file "${entry?.file}" in "${spoke}".`);
            }
            if (excludedPrefixes.some(dir => normalizedFile.startsWith(dir))) {
                throw new Error(`[learn-spokes] Excluded internal record "${normalizedFile}" cannot be materialized in "${spoke}".`);
            }
            if (typeof entry?.route !== 'string' || !entry.route.startsWith('/learn/') || entry.route.endsWith('/') || entry.route.endsWith('.md') || entry.route.includes('..')) {
                throw new Error(`[learn-spokes] Invalid entry route "${entry?.route}" in "${spoke}".`);
            }

            const expectedRoute = splicedLeaves.get(normalizedFile);
            if (expectedRoute !== entry.route) {
                throw new Error(
                    `[learn-spokes] Route mismatch in "${spoke}" for "${normalizedFile}": manifest has "${entry.route}", tree expects "${expectedRoute}".`
                );
            }

            const existingRouteOwner = claimedRoutes.get(entry.route);
            if (existingRouteOwner) {
                throw new Error(`[learn-spokes] Route collision on "${entry.route}" between "${existingRouteOwner}" and "${spoke}".`);
            }
            claimedRoutes.set(entry.route, spoke);

            const srcFile = path.resolve(checkoutDir, normalizedFile);
            if (!srcFile.startsWith(spokeLearnRoot + path.sep) || !existsSync(srcFile) || !statSync(srcFile).isFile()) {
                throw new Error(`[learn-spokes] Missing admitted Markdown file "${normalizedFile}" in "${spoke}".`);
            }
            admittedAbsFiles.add(srcFile);

            const epochSec = readGitCommitEpoch(checkoutDir, normalizedFile);
            if (!epochSec) {
                throw new Error(`[learn-spokes] Missing commit or mtime timestamp for "${normalizedFile}" in "${spoke}".`);
            }

            const isoDate = new Date(epochSec * 1000).toISOString().slice(0, 10);
            routeLastmods[entry.route] = isoDate;

            copyPlan.push({
                admittedAbsFiles,
                checkoutDir,
                commitRef,
                destRel: `${entry.route.slice('/learn/'.length)}.md`,
                epochSec,
                isoDate,
                route  : entry.route,
                sourceRoots,
                spoke,
                srcFile
            });
            spokeLeafCount++;
        }
    }

    if (splicesByHubParent.has('Benefits') && !claimedNodeIds.has('benefits/body')) {
        throw new Error('[learn-spokes] Missing required hub anchor "benefits/body" under "Benefits".');
    }
    if (splicesByHubParent.has('AgentInterfaces') && !claimedNodeIds.has('AgentInterfaces/Decisions')) {
        throw new Error('[learn-spokes] Missing required hub anchor "AgentInterfaces/Decisions" under "AgentInterfaces".');
    }

    const composedData       = [];
    const insertedHubParents = new Set();
    const flushGroups        = hubParentId => {
        if (insertedHubParents.has(hubParentId)) return;
        insertedHubParents.add(hubParentId);
        for (const group of splicesByHubParent.get(hubParentId) || []) {
            composedData.push(...group.nodes);
        }
    };

    const guidesSubtreeIds = new Set();
    if (hubFoldersByLowerId.has('guides')) {
        const guidesId = hubFoldersByLowerId.get('guides').id;
        guidesSubtreeIds.add(guidesId);
        let grew = true;
        while (grew) {
            grew = false;
            for (const node of resolvedBaseTree.data) {
                if (!guidesSubtreeIds.has(node.id) && node.parentId && guidesSubtreeIds.has(node.parentId)) {
                    guidesSubtreeIds.add(node.id);
                    grew = true;
                }
            }
        }
    }

    for (let i = 0; i < resolvedBaseTree.data.length; i++) {
        const node = resolvedBaseTree.data[i];

        if (node.id === 'benefits/body' && splicesByHubParent.has('Benefits')) {
            flushGroups('Benefits');
        }
        if (node.id === 'AgentInterfaces/Decisions' && splicesByHubParent.has('AgentInterfaces')) {
            flushGroups('AgentInterfaces');
        }

        composedData.push({...node});

        if (guidesSubtreeIds.has(node.id)) {
            const guidesId = hubFoldersByLowerId.get('guides').id;
            const nextNode = resolvedBaseTree.data[i + 1];

            if (!nextNode || !guidesSubtreeIds.has(nextNode.id)) {
                flushGroups(guidesId);
            }
        }
    }

    for (const hubParentId of splicesByHubParent.keys()) {
        if (!insertedHubParents.has(hubParentId)) {
            throw new Error(`[learn-spokes] Failed to splice spoke groups into hub parent "${hubParentId}".`);
        }
    }

    const composedTree = {data: composedData};

    if (targetLearnDir) {
        const learnDest = path.resolve(targetLearnDir);

        if (pristineLearnDir) {
            const resolvedPristine = path.resolve(pristineLearnDir);
            if (resolvedPristine === learnDest) {
                throw new Error('[learn-spokes] pristineLearnDir must be distinct from targetLearnDir.');
            }
            await fs.remove(learnDest);
            await fs.copy(resolvedPristine, learnDest, {preserveTimestamps: true});
        } else {
            await fs.ensureDir(learnDest);
        }

        for (const item of copyPlan) {
            const destFile = path.resolve(learnDest, item.destRel);
            if (!destFile.startsWith(learnDest + path.sep)) {
                throw new Error(`[learn-spokes] Destination escaped learn/ root for "${item.route}".`);
            }
            await fs.ensureDir(path.dirname(destFile));

            if (item.sourceRoots.length > 0) {
                const rawMarkdown = await fs.readFile(item.srcFile, 'utf-8');
                const rewritten   = rewriteSpokeSourceLinks({
                    admittedAbsFiles: item.admittedAbsFiles,
                    checkoutDir     : item.checkoutDir,
                    commitRef       : item.commitRef,
                    markdown        : rawMarkdown,
                    sourceRoots     : item.sourceRoots,
                    spoke           : item.spoke,
                    srcFile         : item.srcFile
                });
                await fs.writeFile(destFile, rewritten, 'utf-8');
            } else {
                await fs.copy(item.srcFile, destFile);
            }

            utimesSync(destFile, item.epochSec, item.epochSec);
        }

        await fs.writeFile(path.join(learnDest, 'tree.json'), `${JSON.stringify(composedTree, null, 4)}\n`, 'utf-8');
        await fs.writeFile(path.join(learnDest, SPOKE_LASTMOD_FILENAME), `${JSON.stringify(routeLastmods, null, 4)}\n`, 'utf-8');
    }

    if (seoJsonPath) {
        const existingSeo = (await fs.pathExists(seoJsonPath)) ? ((await fs.readJSON(seoJsonPath).catch(() => null)) || {}) : {};

        for (const existingRoute of Object.keys(existingSeo)) {
            if (existingRoute.startsWith('/learn/') && !claimedRoutes.has(existingRoute)) {
                delete existingSeo[existingRoute];
            }
        }
        for (const [route, isoDate] of Object.entries(routeLastmods)) {
            existingSeo[route] = {
                ...(existingSeo[route] || {}),
                lastmod: isoDate
            };
        }

        await fs.ensureDir(path.dirname(seoJsonPath));
        await fs.writeFile(seoJsonPath, `${JSON.stringify(existingSeo, null, 4)}\n`, 'utf-8');
    }

    return {
        composedTree,
        routeLastmods,
        spokeLeafCount,
        totalLeafCount        : composedData.filter(node => node.isLeaf !== false).length,
        totalMarkdownLeafCount: composedData.filter(node => node.isLeaf !== false && !node.route).length
    };
}
