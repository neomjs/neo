import {test, expect}   from '@playwright/test';
import {spawnSync}      from 'node:child_process';
import path             from 'node:path';

import {
    folderPrefix,
    isGroup,
    lintTree,
    runLint
} from '../../../../../../ai/scripts/lint/lint-tree-json.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-tree-json.mjs` — the structural lint that
 * verifies `learn/tree.json` mirrors the on-disk `learn/` folder structure (#12247).
 *
 * Empirical anchors (the drift this lint mechanizes): #12238 added a phantom `BenefitsBrain`
 * nav group over files that were flat in `learn/benefits/` (PHANTOM_GROUP); #12240 let a
 * parent label outgrow its contents. Both were caught by human / cross-family review, not
 * tooling — this spec proves the four invariants now catch the mechanical cases at CI time.
 *
 * Test axes:
 *   - LEAF_FILE          leaf id with no backing learn/<id>.md
 *   - PARENT_NOT_GROUP   parentId pointing at a leaf (or a group missing isLeaf:false)
 *   - ORPHAN             parentId referencing a non-existent node
 *   - GROUP_SPANS_FOLDERS a group whose direct leaves span >1 folder
 *   - PHANTOM_GROUP      >1 nav group owning the same folder (the #12238 reproducer)
 *   - DUP_ID / MISSING_ID / STRUCTURE  malformed input guards
 *   - happy path: a well-formed fixture + the real learn/tree.json both pass
 *
 * The `lintTree` core is pure (injectable `fileExists`), so the bulk runs without a shell-out.
 */
test.describe('ai/scripts/lint-tree-json (#12247 — learn/tree.json mirrors learn/ folder structure)', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lint/lint-tree-json.mjs');

    /** Convenience: run lintTree and return the sorted set of violation codes. */
    const codes = (nodes, fileExists = () => true) =>
        lintTree({data: nodes}, {fileExists}).map(v => v.code).sort();

    // ---- CLI ----

    test('CLI: --help exits 0 with usage text', () => {
        const result = spawnSync('node', [scriptPath, '--help'], {cwd: process.cwd(), encoding: 'utf8'});

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage: node ai/scripts/lint/lint-tree-json.mjs');
        expect(result.stdout).toContain('LEAF_FILE');
        expect(result.stdout).toContain('FOLDER_UNIQUENESS');
    });

    test('CLI: the real learn/tree.json passes (mirrors the folder structure)', () => {
        const result = spawnSync('node', [scriptPath], {cwd: process.cwd(), encoding: 'utf8'});

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('[lint-tree-json] OK');
    });

    // ---- pure invariants ----

    test('happy path: a well-formed group + leaf produces no violations', () => {
        expect(codes([
            {id: 'Benefits', isLeaf: false, parentId: null},
            {id: 'benefits/A', parentId: 'Benefits'}
        ])).toEqual([]);
    });

    test('LEAF_FILE: a leaf id with no backing file is flagged', () => {
        expect(codes(
            [{id: 'Benefits', isLeaf: false, parentId: null}, {id: 'benefits/Gone', parentId: 'Benefits'}],
            rel => rel !== 'benefits/Gone.md'
        )).toEqual(['LEAF_FILE']);
    });

    test('PARENT_NOT_GROUP: a leaf used as a parent is flagged', () => {
        expect(codes([
            {id: 'benefits/Parent', parentId: null},              // a leaf (no isLeaf:false)
            {id: 'benefits/Child', parentId: 'benefits/Parent'}   // parented by the leaf
        ])).toEqual(['PARENT_NOT_GROUP']);
    });

    test('ORPHAN: a parentId referencing a non-existent node is flagged', () => {
        expect(codes([
            {id: 'Benefits', isLeaf: false, parentId: null},
            {id: 'benefits/A', parentId: 'Ghost'}
        ])).toEqual(['ORPHAN']);
    });

    test('GROUP_SPANS_FOLDERS: a group whose leaves span two folders is flagged', () => {
        expect(codes([
            {id: 'Mixed', isLeaf: false, parentId: null},
            {id: 'benefits/A', parentId: 'Mixed'},
            {id: 'guides/B', parentId: 'Mixed'}
        ])).toEqual(['GROUP_SPANS_FOLDERS']);
    });

    test('PHANTOM_GROUP: two nav groups owning the same folder are flagged (#12238 reproducer)', () => {
        expect(codes([
            {id: 'Benefits', isLeaf: false, parentId: null},
            {id: 'BenefitsBrain', isLeaf: false, parentId: null},
            {id: 'benefits/A', parentId: 'Benefits'},
            {id: 'benefits/B', parentId: 'BenefitsBrain'}         // distinct leaf, SAME folder
        ])).toEqual(['PHANTOM_GROUP']);
    });

    test('DUP_ID / MISSING_ID / STRUCTURE guards fire', () => {
        expect(codes([
            {id: 'Benefits', isLeaf: false, parentId: null},
            {id: 'Benefits', isLeaf: false, parentId: null}
        ])).toContain('DUP_ID');
        expect(codes([{name: 'no-id', parentId: null}])).toContain('MISSING_ID');
        expect(lintTree({nope: 1}).map(v => v.code)).toEqual(['STRUCTURE']);
    });

    // ---- exported helpers ----

    test('folderPrefix: nested id → directory part; root-level id → empty string', () => {
        expect(folderPrefix('benefits/Introduction')).toBe('benefits');
        expect(folderPrefix('agentos/cloud-deployment/Overview')).toBe('agentos/cloud-deployment');
        expect(folderPrefix('UsingTheseTopics')).toBe('');
    });

    test('isGroup: only an explicit isLeaf:false node is a group', () => {
        expect(isGroup({id: 'G', isLeaf: false})).toBe(true);
        expect(isGroup({id: 'L'})).toBe(false);
        expect(isGroup({id: 'L', isLeaf: true})).toBe(false);
    });

    test('runLint: exported entry returns a numeric exit code on the real tree', () => {
        const {exitCode, violations} = runLint();

        expect(exitCode).toBe(0);
        expect(violations).toEqual([]);
    });
});
