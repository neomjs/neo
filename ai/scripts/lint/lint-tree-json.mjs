#!/usr/bin/env node
/**
 * @summary Structural lint that verifies `learn/tree.json` (the docs-portal navigation
 * tree, which also feeds `buildScripts/docs/seo/generate.mjs` content URLs + sitemap)
 * mirrors the on-disk `learn/` folder structure and remains consumable by the SEO generator.
 *
 * `tree.json` is a flat `parentId` adjacency list — `{"data": [ {name, parentId, id,
 * isLeaf?, collapsed?} ... ]}` — not a nested tree. Hierarchy is encoded via `parentId`;
 * a **leaf**'s `id` is its `learn/`-relative path (`benefits/ApplicationEngine` →
 * `learn/benefits/ApplicationEngine.md`); a **group** carries `isLeaf:false` and a PascalCase
 * `id` referenced by its children's `parentId`.
 *
 * Because it is hand-edited JSON with no schema enforcement, drift is silent until it
 * breaks portal nav / SEO. This lint enforces seven mechanical invariants:
 *
 *   1. LEAF_FILE        — every leaf `id` resolves to an existing `learn/<id>.md`.
 *   2. PARENT_INTEGRITY — every non-null `parentId` references an existing group node.
 *   3. GROUP_COHESION   — a group's direct leaf-children all share ONE folder-prefix
 *                         (a nav group maps to at most one folder).
 *   4. FOLDER_UNIQUENESS — no two distinct groups own leaves of the same folder-prefix
 *                         (a folder maps to at most one nav group; the phantom-group guard).
 *   5. EXPLORATION_ARTIFACT — no leaf whose basename is an exploration/process artifact
 *                         (`*Audit`/`*Plan`/`*Sweep`/`*Census`/`*Forensics`/`*Benchmark`);
 *                         learn/ is public docs, so these belong in a non-published subfolder
 *                         or the owning ticket, never the portal nav.
 *   6. SEO_GENERATE     — the SEO generator can run from the current tree. The checked-in
 *                         SEO outputs are pipeline-owned and are deliberately NOT compared
 *                         or required in guide PRs.
 *   7. NO_TOP_LEVEL_ORPHAN — every depth-1 `learn/agentos/*.md` on disk is EITHER a
 *                         registered `tree.json` leaf (published nav) OR an intentionally-internal
 *                         allowlist entry. Catches the orphan-dump mode (5) misses: (5) is
 *                         suffix-based (`*Audit`/`*Benchmark`/…); (7) catches ANY unregistered
 *                         top-level doc. Relocate non-guide artifacts to a non-published
 *                         subfolder (`process/`, `incidents/`, `measurements/`, `tooling/`, …).
 *
 * (3) + (4) together assert a group ↔ folder bijection for leaf-bearing groups: the
 * mechanical form of "the nav tree mirrors the folder layout." (1) transitively covers
 * folder existence, so no separate folder-existence check is needed.
 *
 * The validator core (`lintTree`) is pure — it takes parsed tree data plus an injectable
 * `fileExists` probe — so it is unit-testable without touching `git` or the real
 * filesystem. The CLI wrapper supplies a real `fs`-backed probe.
 *
 * Usage: `node ai/scripts/lint/lint-tree-json.mjs` (no arguments; validates the whole file).
 * @plane in-plane
 */
import fs               from 'node:fs';
import path             from 'node:path';
import process          from 'node:process';
import {fileURLToPath}  from 'node:url';

import {
    getLlmsTxt,
    getSitemapXml
} from '../../../buildScripts/docs/seo/generate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');
const LEARN_DIR  = path.join(ROOT_DIR, 'learn');
const TREE_PATH  = path.join(LEARN_DIR, 'tree.json');
const PORTAL_DIR = path.join(ROOT_DIR, 'apps/portal');
const SITEMAP_PATH      = path.join(PORTAL_DIR, 'sitemap.xml');
const DEFAULT_BASE_URL = 'https://neomjs.com';

// Invariant 5: exploration/process-artifact basename suffixes that must never be published.
// `learn/` is public docs; these are tracking/process outputs whose home is a non-published
// subfolder or the owning ticket, not the public portal nav.
const EXPLORATION_ARTIFACT_SUFFIXES = 'audit/plan/sweep/census/forensics/benchmark (any case)';
// Case-insensitive: the on-disk artifact inventory mixes CamelCase (`ConfigSubstrateEnvVarAudit`)
// and kebab/lowercase (`gemma4-rem-benchmark`, `sandman-silent-failure-forensics`) basenames.
const EXPLORATION_ARTIFACT_RE       = /(?:audit|plan|sweep|census|forensics|benchmark)$/i;

// Invariant 7: intentionally-internal top-level `learn/agentos/*.md` docs that are NOT in the
// portal nav but ARE load-bearing reference substrate (referenced at-path by the turn-loaded
// root `AGENTS.md` and/or ADRs). Pure data — never a threshold. Every OTHER depth-1
// `learn/agentos/*.md` must be a registered `tree.json` leaf or be relocated to a subfolder.
const NO_TOP_LEVEL_ORPHAN_DIR       = 'agentos';
const NO_TOP_LEVEL_ORPHAN_ALLOWLIST = new Set([
    'agentos/AGENTS_ATLAS',   // Atlas companion to the turn-loaded root AGENTS.md
    'agentos/IdentitySchema', // AgentIdentity graph-node schema (companion to ModelStats)
    'agentos/ModelStats',     // Per-model swarm identity/capability/routing registry
    'agentos/v13-path'        // Chief-architect v13 architectural-path planning doc
]);

/**
 * Returns the folder-prefix (directory part) of a leaf `id`, using POSIX semantics so
 * the result is OS-independent. Root-level leaves (no slash) yield `''`.
 * @param {string} id
 * @returns {string}
 */
function folderPrefix(id) {
    const dir = path.posix.dirname(id);
    return dir === '.' ? '' : dir;
}

/**
 * A node is a GROUP iff it is **explicitly** marked `isLeaf:false`; everything else is a
 * LEAF. Classification is deliberately explicit (not "is this node referenced as a
 * parent?") so that a leaf mistakenly used as a parent — or a real group that forgot its
 * `isLeaf:false` flag — surfaces as a `PARENT_NOT_GROUP` violation instead of being
 * silently reclassified into a group (which would also mask its missing-file check).
 * @param {object} node
 * @returns {boolean}
 */
function isGroup(node) {
    return node.isLeaf === false;
}

/**
 * Returns leaf ids from parsed tree data, preserving `tree.json` semantics.
 * @param {{data: Array<object>}} treeData Parsed `tree.json`.
 * @returns {String[]}
 */
function getLeafIds(treeData) {
    const nodes = Array.isArray(treeData?.data) ? treeData.data : [];

    return nodes
        .filter(node => !isGroup(node) && node?.id != null)
        .map(node => node.id);
}

/**
 * Extracts checked-in learn/ URLs from `llms.txt`.
 * @param {String} llmsTxt The checked-in `apps/portal/llms.txt` content.
 * @param {String} [baseUrl] The canonical site base URL.
 * @returns {Set<String>}
 */
function getLlmsLearnUrls(llmsTxt, baseUrl=DEFAULT_BASE_URL) {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const urls = new Set();
    const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const urlRegex = new RegExp(`${escapedBase}/raw/learn/([^\\s)]+?\\.md)`, 'g');

    for (const match of llmsTxt.matchAll(urlRegex)) {
        urls.add(match[1].replace(/\.md$/, ''));
    }

    return urls;
}

/**
 * Extracts checked-in learn/ URLs from `sitemap.xml`.
 * @param {String} sitemapXml The checked-in `apps/portal/sitemap.xml` content.
 * @param {String} [baseUrl] The canonical site base URL.
 * @returns {Set<String>}
 */
function getSitemapLearnUrls(sitemapXml, baseUrl=DEFAULT_BASE_URL) {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const urls = new Set();
    const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const urlRegex = new RegExp(`<loc>${escapedBase}/learn/([^<]+)</loc>`, 'g');

    for (const match of sitemapXml.matchAll(urlRegex)) {
        urls.add(match[1]);
    }

    return urls;
}

/**
 * Compares expected learn URLs against one generated SEO surface.
 * @param {String} surfaceName Human-readable surface name.
 * @param {ReadonlySet<String>} expectedIds Expected generated learn ids.
 * @param {ReadonlySet<String>} actualIds IDs parsed from the generated output.
 * @returns {Array<{code: string, message: string}>}
 */
function compareSeoSurface(surfaceName, expectedIds, actualIds) {
    const violations = [];
    const missing = [...expectedIds].filter(id => !actualIds.has(id)).sort();
    const extra   = [...actualIds].filter(id => !expectedIds.has(id)).sort();

    if (missing.length > 0) {
        violations.push({
            code   : 'SEO_GENERATED_MISSING',
            message: `${surfaceName} is missing ${missing.length} generated learn route(s): ${missing.join(', ')}. Check buildScripts/docs/seo/generate.mjs.`
        });
    }

    if (extra.length > 0) {
        violations.push({
            code   : 'SEO_GENERATED_EXTRA',
            message: `${surfaceName} contains ${extra.length} stale learn/ route(s) not present in tree.json: ${extra.join(', ')}. Check buildScripts/docs/seo/generate.mjs.`
        });
    }

    return violations;
}

/**
 * Pure SEO-generator validator. It compares tree-derived learn routes against the
 * generator's in-memory URL sets. It deliberately does not inspect checked-in
 * `apps/portal/llms.txt` or `apps/portal/sitemap.xml`: those files are generated output
 * owned by the data-sync pipeline, not guide PR input.
 * @param {{data: Array<object>}} treeData Parsed `tree.json`.
 * @param {{generatedLlmsIds: Set, generatedSitemapIds: Set, expectedLlmsIds: Set, expectedSitemapIds: Set}} options Generated sets required; expected sets fall back to tree-derived sets.
 * @returns {Array<{code: string, message: string}>}
 */
function lintGeneratedSeoRoutes(treeData, {
    generatedLlmsIds,
    generatedSitemapIds,
    expectedLlmsIds,
    expectedSitemapIds
}) {
    const expectedIds = new Set(getLeafIds(treeData));

    return [
        ...compareSeoSurface('generated llms.txt', expectedLlmsIds ?? expectedIds, generatedLlmsIds ?? new Set()),
        ...compareSeoSurface('generated sitemap.xml', expectedSitemapIds ?? expectedIds, generatedSitemapIds ?? new Set())
    ];
}

/**
 * Regenerates the SEO outputs in memory and extracts their learn/ URL sets.
 * @param {{baseUrl: string, sitemapPath: string}} [options] Both keys optional (defaults applied).
 * @returns {Promise<{expectedLlmsIds: Set<String>, expectedSitemapIds: Set<String>}>}
 */
async function getGeneratedSeoLearnUrls({
    baseUrl = DEFAULT_BASE_URL,
    sitemapPath = SITEMAP_PATH
} = {}) {
    const [llmsTxt, sitemapXml] = await Promise.all([
        getLlmsTxt({baseUrl}),
        getSitemapXml({baseUrl, existingSitemapPath: sitemapPath})
    ]);

    return {
        generatedLlmsIds   : getLlmsLearnUrls(llmsTxt, baseUrl),
        generatedSitemapIds: getSitemapLearnUrls(sitemapXml, baseUrl)
    };
}

/**
 * Pure structural validator. Feed it parsed tree data and a `fileExists(relPath)` probe
 * (relative to `learn/`); get back a flat list of violation records. No `git`, no `fs`
 * unless the caller's probe touches it — exported for unit testing.
 *
 * @param {{data: Array<object>}} treeData Parsed `tree.json`.
 * @param {{fileExists: Function, readDir: Function}} [probes] Optional probes: `fileExists(relPathFromLearn) → Boolean`, `readDir(relPathFromLearn) → String[]`.
 * @returns {Array<{code: string, message: string}>}
 */
function lintTree(treeData, {fileExists, readDir} = {}) {
    const violations = [];
    const nodes      = treeData?.data;

    if (!Array.isArray(nodes)) {
        return [{code: 'STRUCTURE', message: 'tree.json must be an object of the form {"data": [ ...nodes ]}.'}];
    }

    const byId = new Map();

    for (const node of nodes) {
        if (node.id == null) {
            violations.push({code: 'MISSING_ID', message: `Node "${node.name ?? '(unnamed)'}" has no id.`});
            continue;
        }
        if (byId.has(node.id)) {
            violations.push({code: 'DUP_ID', message: `Duplicate node id "${node.id}".`});
        }
        byId.set(node.id, node);
    }

    // Invariant 2: parentId integrity — parent exists AND is a group.
    for (const node of nodes) {
        if (node.parentId == null) continue;

        const parent = byId.get(node.parentId);

        if (!parent) {
            violations.push({code: 'ORPHAN', message: `Node "${node.id}" has parentId "${node.parentId}", which does not exist.`});
        } else if (!isGroup(parent)) {
            violations.push({code: 'PARENT_NOT_GROUP', message: `Node "${node.id}" is parented by "${node.parentId}", which is not marked as a group (isLeaf:false) — either a leaf misused as a parent, or a group missing its isLeaf:false flag.`});
        }
    }

    // Invariant 1: leaf id -> backing file exists.
    if (fileExists) {
        for (const node of nodes) {
            if (isGroup(node) || node.id == null) continue;

            if (!fileExists(`${node.id}.md`)) {
                violations.push({code: 'LEAF_FILE', message: `Leaf "${node.id}" has no backing file learn/${node.id}.md.`});
            }
        }
    }

    // Invariants 3 + 4: group <-> folder bijection (leaf-bearing groups only).
    const groupFolders = new Map(); // groupId -> Set<folderPrefix>
    const folderGroups = new Map(); // folderPrefix -> Set<groupId>

    for (const node of nodes) {
        if (isGroup(node) || node.id == null || node.parentId == null) continue; // skip groups + root leaves

        const prefix = folderPrefix(node.id);

        if (!groupFolders.has(node.parentId)) groupFolders.set(node.parentId, new Set());
        groupFolders.get(node.parentId).add(prefix);

        if (!folderGroups.has(prefix)) folderGroups.set(prefix, new Set());
        folderGroups.get(prefix).add(node.parentId);
    }

    // Invariant 3: a group's direct leaves share exactly one folder-prefix.
    for (const [groupId, prefixes] of groupFolders) {
        if (prefixes.size > 1) {
            const folders = [...prefixes].map(p => p || '(learn root)').join(', ');
            violations.push({code: 'GROUP_SPANS_FOLDERS', message: `Group "${groupId}" has leaf children from multiple folders: ${folders}. A nav group must map to a single folder.`});
        }
    }

    // Invariant 4: a folder-prefix is owned by exactly one group (phantom-group guard).
    for (const [prefix, groupIds] of folderGroups) {
        if (groupIds.size > 1) {
            const groups = [...groupIds].join(', ');
            violations.push({code: 'PHANTOM_GROUP', message: `Folder "learn/${prefix}" is split across multiple nav groups: ${groups}. Each folder maps to exactly one group — drop the phantom group or back it with a real subfolder.`});
        }
    }

    // Invariant 5: no exploration/process artifact published in the public nav.
    for (const node of nodes) {
        if (isGroup(node) || node.id == null) continue;

        const basename = node.id.split('/').pop();

        if (EXPLORATION_ARTIFACT_RE.test(basename)) {
            violations.push({code: 'EXPLORATION_ARTIFACT', message: `Leaf "${node.id}" is an exploration/process artifact (basename ends in ${EXPLORATION_ARTIFACT_SUFFIXES}). learn/ is public docs — these belong in a non-published subfolder or the owning ticket, not the portal nav. Remove it from tree.json.`});
        }
    }

    // Invariant 7: no unregistered top-level learn/agentos/*.md orphan. Every depth-1
    // learn/agentos/*.md on disk must be a registered tree.json leaf (published nav) OR an
    // intentionally-internal allowlist entry; otherwise it is an orphan-dump that the
    // suffix-based EXPLORATION_ARTIFACT (invariant 5) does not catch. Relocate non-guides
    // to a non-published subfolder. `readDir` is non-recursive, so this is depth-1 only.
    if (readDir) {
        const registeredLeafIds = new Set(getLeafIds(treeData));
        const topLevelDocs      = readDir(NO_TOP_LEVEL_ORPHAN_DIR).filter(name => name.endsWith('.md'));

        for (const name of topLevelDocs) {
            const id = `${NO_TOP_LEVEL_ORPHAN_DIR}/${name.replace(/\.md$/, '')}`;

            if (!registeredLeafIds.has(id) && !NO_TOP_LEVEL_ORPHAN_ALLOWLIST.has(id)) {
                violations.push({code: 'NO_TOP_LEVEL_ORPHAN', message: `Top-level doc learn/${id}.md is neither a registered tree.json leaf nor a NO_TOP_LEVEL_ORPHAN allowlist entry. learn/${NO_TOP_LEVEL_ORPHAN_DIR}/ top-level is reserved for published guides (registered in tree.json) + intentionally-internal reference substrate (allowlisted in lint-tree-json.mjs); relocate process/incident/measurement artifacts to a non-published subfolder (process/, incidents/, measurements/, tooling/, wake-substrate/, …).`});
            }
        }
    }

    return violations;
}

/**
 * CLI entry. Reads + parses `tree.json`, runs `lintTree` with a real fs-backed probe,
 * verifies that SEO routes can be generated in memory, prints a report, and returns a numeric exit
 * code (so tests can drive it without triggering `process.exit`).
 * @param {{treePath: string, learnDir: string, sitemapPath: string, baseUrl: string, checkSeo: boolean}} [options] All keys optional (defaults applied).
 * @returns {Promise<{exitCode: number, violations: Array<{code: string, message: string}>}>}
 */
async function runLint({
    treePath = TREE_PATH,
    learnDir = LEARN_DIR,
    sitemapPath = SITEMAP_PATH,
    baseUrl = DEFAULT_BASE_URL,
    checkSeo = true
} = {}) {
    let treeData;

    try {
        treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    } catch (error) {
        console.error(`[lint-tree-json] FAILED — cannot read/parse ${path.relative(ROOT_DIR, treePath)}: ${error.message}`);
        return {exitCode: 1, violations: [{code: 'PARSE', message: error.message}]};
    }

    const fileExists = relPath => fs.existsSync(path.join(learnDir, relPath));
    const readDir    = relPath => {
        try {
            return fs.readdirSync(path.join(learnDir, relPath));
        } catch {
            return [];
        }
    };
    const violations = lintTree(treeData, {fileExists, readDir});

    if (checkSeo) {
        try {
            await getGeneratedSeoLearnUrls({
                baseUrl,
                sitemapPath
            });
        } catch (error) {
            violations.push({
                code   : 'SEO_OUTPUT_GENERATE',
                message: `Cannot regenerate SEO outputs in memory: ${error.message}`
            });
        }

        // The output surfaces intentionally differ (`llms.txt` excludes non-LLM guide
        // routes such as Glossary). The CLI gate only verifies that the generator can
        // consume the current tree without requiring guide PRs to commit pipeline-owned
        // generated files.
    }

    if (violations.length === 0) {
        console.log(`[lint-tree-json] OK — learn/tree.json mirrors the learn/ folder structure and the SEO generator accepts it (${treeData.data.length} nodes).`);
        return {exitCode: 0, violations};
    }

    console.error(`[lint-tree-json] FAILED — ${violations.length} violation(s) across learn/tree.json and generated SEO routes:\n`);
    for (const violation of violations) {
        console.error(`- [${violation.code}] ${violation.message}`);
    }
    console.error('\nlearn/tree.json must mirror the on-disk learn/ folder: every leaf id maps to learn/<id>.md,');
    console.error('every parentId references a real group, and each folder maps to exactly one nav group.');
    console.error('buildScripts/docs/seo/generate.mjs must be able to consume tree.json without requiring checked-in generated outputs.');
    return {exitCode: 1, violations};
}

async function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-tree-json.mjs');
        console.log('');
        console.log('Validates that learn/tree.json mirrors the learn/ folder structure:');
        console.log('  1. LEAF_FILE         every leaf id -> learn/<id>.md exists');
        console.log('  2. PARENT_INTEGRITY  every parentId references an existing group');
        console.log('  3. GROUP_COHESION    a group\'s direct leaves share one folder');
        console.log('  4. FOLDER_UNIQUENESS each folder maps to one group (phantom-group guard)');
        console.log('  5. EXPLORATION_ARTIFACT no audit/plan/sweep/census/forensics/benchmark leaf in nav');
        console.log('  6. SEO_GENERATE      generator accepts tree.json; checked-in SEO outputs are pipeline-owned');
        console.log('  7. NO_TOP_LEVEL_ORPHAN every depth-1 learn/agentos/*.md is registered or allowlisted');
        process.exit(0);
    }

    const {exitCode} = await runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(error => {
        console.error(`[lint-tree-json] FAILED — unexpected error: ${error.message}`);
        process.exit(1);
    });
}

export {
    folderPrefix,
    getGeneratedSeoLearnUrls,
    getLeafIds,
    getLlmsLearnUrls,
    getSitemapLearnUrls,
    isGroup,
    lintGeneratedSeoRoutes,
    lintTree,
    runLint
};
