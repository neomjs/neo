import {test, expect}   from '@playwright/test';
import {spawnSync}      from 'node:child_process';
import path             from 'node:path';

import {
    folderPrefix,
    getLeafIds,
    getLlmsLearnUrls,
    getSitemapLearnUrls,
    isGroup,
    lintGeneratedSeoRoutes,
    lintTree,
    runLint
} from '../../../../../../ai/scripts/lint/lint-tree-json.mjs';

/**
 * @summary Coverage for `ai/scripts/lint/lint-tree-json.mjs` — the structural lint that
 * verifies `learn/tree.json` mirrors the on-disk `learn/` folder structure.
 *
 * Empirical anchors (the drift this lint mechanizes): a phantom `BenefitsBrain` nav group
 * once sat over files that were flat in `learn/benefits/` (PHANTOM_GROUP), and another
 * parent label outgrew its contents. Both were caught by human / cross-family review, not
 * tooling — this spec proves the invariants now catch the mechanical cases at CI time.
 *
 * Test axes:
 *   - LEAF_FILE          leaf id with no backing learn/<id>.md
 *   - PARENT_NOT_GROUP   parentId pointing at a leaf (or a group missing isLeaf:false)
 *   - ORPHAN             parentId referencing a non-existent node
 *   - GROUP_SPANS_FOLDERS a group whose direct leaves span >1 folder
 *   - PHANTOM_GROUP      >1 nav group owning the same folder (the phantom-group reproducer)
 *   - EXPLORATION_ARTIFACT a published leaf whose basename is an audit/plan/sweep/census/
 *                          forensics/benchmark artifact (learn/ is public docs)
 *   - NO_TOP_LEVEL_ORPHAN a depth-1 learn/agentos/*.md on disk that is neither a registered
 *                          tree.json leaf nor an intentionally-internal allowlist entry
 *   - SEO_GENERATED_MISSING generated learn URL missing from generated llms.txt / sitemap.xml
 *   - SEO_GENERATED_EXTRA   stale generated llms.txt / sitemap.xml learn URL
 *   - DUP_ID / MISSING_ID / STRUCTURE  malformed input guards
 *   - happy path: a well-formed fixture + the real learn/tree.json both pass
 *
 * The `lintTree` core is pure (injectable `fileExists`), so the bulk runs without a shell-out.
 */
test.describe('ai/scripts/lint-tree-json (learn/tree.json mirrors learn/ folder structure)', () => {
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
        expect(result.stdout).toContain('EXPLORATION_ARTIFACT');
        expect(result.stdout).toContain('SEO_GENERATE');
        expect(result.stdout).toContain('NO_TOP_LEVEL_ORPHAN');
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

    test('PHANTOM_GROUP: two nav groups owning the same folder are flagged', () => {
        expect(codes([
            {id: 'Benefits', isLeaf: false, parentId: null},
            {id: 'BenefitsBrain', isLeaf: false, parentId: null},
            {id: 'benefits/A', parentId: 'Benefits'},
            {id: 'benefits/B', parentId: 'BenefitsBrain'}         // distinct leaf, SAME folder
        ])).toEqual(['PHANTOM_GROUP']);
    });

    test('EXPLORATION_ARTIFACT: each artifact-suffix leaf is flagged; real guides are spared (#12511)', () => {
        for (const id of [
            // CamelCase basenames
            'agentos/SkillCompressionRolloutPlan', 'agentos/ConfigSubstrateEnvVarAudit', 'agentos/Tier2RevalidationSweep', 'agentos/SomeCensus', 'agentos/SomeForensics', 'agentos/gemma4Benchmark',
            // kebab/lowercase basenames — the on-disk file-naming style must be caught too (case-insensitive)
            'agentos/gemma4-rem-benchmark', 'agentos/sandman-silent-failure-forensics', 'agentos/config-substrate-env-var-audit'
        ]) {
            expect(codes([
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id, parentId: 'AgentOS'}
            ]), id).toEqual(['EXPLORATION_ARTIFACT']);
        }

        // real guide basenames must NOT trip the heuristic (negative-mutation control)
        for (const id of ['agentos/AiConfigModel', 'agentos/MX', 'agentos/rem-state-model', 'agentos/DeploymentCookbook']) {
            expect(codes([
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id, parentId: 'AgentOS'}
            ]), id).toEqual([]);
        }
    });

    test('EXPLORATION_ARTIFACT: a GROUP whose id ends in a suffix is NOT flagged (only published leaves)', () => {
        expect(codes([
            {id: 'AuditPlan', isLeaf: false, parentId: null},
            {id: 'auditplan/Overview', parentId: 'AuditPlan'}
        ])).toEqual([]);
    });

    test('NO_TOP_LEVEL_ORPHAN: unregistered top-level agentos doc flagged; registered + allowlisted + subfolder spared (#12513)', () => {
        const tree = [
            {id: 'AgentOS', isLeaf: false, parentId: null},
            {id: 'agentos/AiConfigModel', parentId: 'AgentOS'}   // a registered published guide
        ];
        // inject a depth-1 readDir mock for `agentos`; invariant 7 is non-recursive (depth-1 only)
        const run = readDir => lintTree({data: tree}, {fileExists: () => true, readDir}).map(v => v.code).sort();

        // an unregistered, non-allowlisted top-level doc → flagged
        expect(run(rel => rel === 'agentos' ? ['Orphan.md'] : [])).toEqual(['NO_TOP_LEVEL_ORPHAN']);

        // a registered published guide → spared
        expect(run(rel => rel === 'agentos' ? ['AiConfigModel.md'] : [])).toEqual([]);

        // each intentionally-internal allowlist entry → spared (negative-mutation control)
        for (const name of ['AGENTS_ATLAS.md', 'IdentitySchema.md', 'ModelStats.md', 'v13-path.md']) {
            expect(run(rel => rel === 'agentos' ? [name] : []), name).toEqual([]);
        }

        // subdir entries (no .md) + nested artifacts live below depth-1 → never checked
        expect(run(rel => rel === 'agentos' ? ['process', 'incidents', 'measurements'] : [])).toEqual([]);

        // no readDir probe → invariant 7 is skipped entirely (pure-mode back-compat)
        expect(lintTree({data: tree}, {fileExists: () => true}).map(v => v.code)).toEqual([]);
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

    test('SEO helpers: extract learn ids from checked-in URL shapes', () => {
        expect(getLlmsLearnUrls(`
            - [A](https://neomjs.com/raw/learn/agentos/OwnAgentTeam.md)
            - [B](https://neomjs.com/raw/learn/Glossary.md)
        `)).toEqual(new Set(['agentos/OwnAgentTeam', 'Glossary']));

        expect(getSitemapLearnUrls(`
            <url><loc>https://neomjs.com/learn/agentos/OwnAgentTeam</loc></url>
            <url><loc>https://neomjs.com/learn/Glossary</loc></url>
        `)).toEqual(new Set(['agentos/OwnAgentTeam', 'Glossary']));
    });

    test('getLeafIds: returns tree leaf ids and skips explicit groups', () => {
        expect(getLeafIds({
            data: [
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id: 'agentos/OwnAgentTeam', parentId: 'AgentOS'}
            ]
        })).toEqual(['agentos/OwnAgentTeam']);
    });

    test('lintGeneratedSeoRoutes: matching generated llms.txt + sitemap.xml URL sets pass', () => {
        const treeData = {
            data: [
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id: 'agentos/OwnAgentTeam', parentId: 'AgentOS'},
                {id: 'Glossary', parentId: null}
            ]
        };

        expect(lintGeneratedSeoRoutes(treeData, {
            generatedLlmsIds   : new Set(['agentos/OwnAgentTeam', 'Glossary']),
            generatedSitemapIds: new Set(['agentos/OwnAgentTeam', 'Glossary'])
        })).toEqual([]);
    });

    test('lintGeneratedSeoRoutes: accepts generator-specific llms.txt and sitemap.xml expected sets', () => {
        const treeData = {
            data: [
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id: 'agentos/OwnAgentTeam', parentId: 'AgentOS'},
                {id: 'Glossary', parentId: null}
            ]
        };

        expect(lintGeneratedSeoRoutes(treeData, {
            expectedLlmsIds   : new Set(['agentos/OwnAgentTeam']),
            expectedSitemapIds: new Set(['agentos/OwnAgentTeam', 'Glossary']),
            generatedLlmsIds   : new Set(['agentos/OwnAgentTeam']),
            generatedSitemapIds: new Set(['agentos/OwnAgentTeam', 'Glossary'])
        })).toEqual([]);
    });

    test('lintGeneratedSeoRoutes: missing tree routes are flagged on both SEO surfaces', () => {
        const treeData = {
            data: [
                {id: 'AgentOS', isLeaf: false, parentId: null},
                {id: 'agentos/OwnAgentTeam', parentId: 'AgentOS'}
            ]
        };

        expect(lintGeneratedSeoRoutes(treeData, {
            generatedLlmsIds   : new Set(),
            generatedSitemapIds: new Set()
        }).map(v => v.code)).toEqual(['SEO_GENERATED_MISSING', 'SEO_GENERATED_MISSING']);
    });

    test('lintGeneratedSeoRoutes: stale generated routes are flagged on both SEO surfaces', () => {
        const treeData = {data: []};

        expect(lintGeneratedSeoRoutes(treeData, {
            generatedLlmsIds   : new Set(['agentos/Gone']),
            generatedSitemapIds: new Set(['agentos/Gone'])
        }).map(v => v.code)).toEqual(['SEO_GENERATED_EXTRA', 'SEO_GENERATED_EXTRA']);
    });

    test('runLint: exported entry returns a numeric exit code on the real tree', async () => {
        const {exitCode, violations} = await runLint();

        expect(exitCode).toBe(0);
        expect(violations).toEqual([]);
    });
});
