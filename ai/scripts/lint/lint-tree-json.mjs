#!/usr/bin/env node
/**
 * @summary Structural lint that verifies `learn/tree.json` (the docs-portal navigation
 * tree, which also feeds `buildScripts/docs/seo/generate.mjs` content URLs + sitemap)
 * mirrors the on-disk `learn/` folder structure.
 *
 * `tree.json` is a flat `parentId` adjacency list — `{"data": [ {name, parentId, id,
 * isLeaf?, collapsed?} ... ]}` — not a nested tree. Hierarchy is encoded via `parentId`;
 * a **leaf**'s `id` is its `learn/`-relative path (`benefits/Introduction` →
 * `learn/benefits/Introduction.md`); a **group** carries `isLeaf:false` and a PascalCase
 * `id` referenced by its children's `parentId`.
 *
 * Because it is hand-edited JSON with no schema enforcement, drift is silent until it
 * breaks portal nav / SEO. This lint enforces four mechanical invariants:
 *
 *   1. LEAF_FILE        — every leaf `id` resolves to an existing `learn/<id>.md`.
 *   2. PARENT_INTEGRITY — every non-null `parentId` references an existing group node.
 *   3. GROUP_COHESION   — a group's direct leaf-children all share ONE folder-prefix
 *                         (a nav group maps to at most one folder).
 *   4. FOLDER_UNIQUENESS — no two distinct groups own leaves of the same folder-prefix
 *                         (a folder maps to at most one nav group; the phantom-group guard).
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
 */
import fs               from 'node:fs';
import path             from 'node:path';
import process          from 'node:process';
import {fileURLToPath}  from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, '../../..');
const LEARN_DIR  = path.join(ROOT_DIR, 'learn');
const TREE_PATH  = path.join(LEARN_DIR, 'tree.json');

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
 * Pure structural validator. Feed it parsed tree data and a `fileExists(relPath)` probe
 * (relative to `learn/`); get back a flat list of violation records. No `git`, no `fs`
 * unless the caller's probe touches it — exported for unit testing.
 *
 * @param {{data: Array<object>}} treeData Parsed `tree.json`.
 * @param {{fileExists?: (relPathFromLearn: string) => boolean}} [probes]
 * @returns {Array<{code: string, message: string}>}
 */
function lintTree(treeData, {fileExists} = {}) {
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

    return violations;
}

/**
 * CLI entry. Reads + parses `tree.json`, runs `lintTree` with a real fs-backed probe,
 * prints a report, and returns a numeric exit code (so tests can drive it without
 * triggering `process.exit`).
 * @param {{treePath?: string, learnDir?: string}} [options]
 * @returns {{exitCode: number, violations: Array<{code: string, message: string}>}}
 */
function runLint({treePath = TREE_PATH, learnDir = LEARN_DIR} = {}) {
    let treeData;

    try {
        treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    } catch (error) {
        console.error(`[lint-tree-json] FAILED — cannot read/parse ${path.relative(ROOT_DIR, treePath)}: ${error.message}`);
        return {exitCode: 1, violations: [{code: 'PARSE', message: error.message}]};
    }

    const fileExists = relPath => fs.existsSync(path.join(learnDir, relPath));
    const violations = lintTree(treeData, {fileExists});

    if (violations.length === 0) {
        console.log(`[lint-tree-json] OK — learn/tree.json mirrors the learn/ folder structure (${treeData.data.length} nodes).`);
        return {exitCode: 0, violations};
    }

    console.error(`[lint-tree-json] FAILED — ${violations.length} structural violation(s) in learn/tree.json:\n`);
    for (const violation of violations) {
        console.error(`- [${violation.code}] ${violation.message}`);
    }
    console.error('\nlearn/tree.json must mirror the on-disk learn/ folder: every leaf id maps to learn/<id>.md,');
    console.error('every parentId references a real group, and each folder maps to exactly one nav group.');
    return {exitCode: 1, violations};
}

function main() {
    const arg = process.argv[2];

    if (arg === '--help' || arg === '-h') {
        console.log('Usage: node ai/scripts/lint/lint-tree-json.mjs');
        console.log('');
        console.log('Validates that learn/tree.json mirrors the learn/ folder structure:');
        console.log('  1. LEAF_FILE         every leaf id -> learn/<id>.md exists');
        console.log('  2. PARENT_INTEGRITY  every parentId references an existing group');
        console.log('  3. GROUP_COHESION    a group\'s direct leaves share one folder');
        console.log('  4. FOLDER_UNIQUENESS each folder maps to one group (phantom-group guard)');
        process.exit(0);
    }

    const {exitCode} = runLint();
    process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main();
}

export {
    folderPrefix,
    isGroup,
    lintTree,
    runLint
};
