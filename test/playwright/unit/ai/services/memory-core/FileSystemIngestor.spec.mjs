import {setup} from '../../../../setup.mjs';

const appName = 'FileSystemIngestorTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import os              from 'os';

test.describe('Neo.ai.services.memory-core.FileSystemIngestor', () => {
    let GraphService;
    let SystemLifecycleService;
    let FileSystemIngestor;
    let mockFsRoot;

    test.beforeAll(async () => {
        // Isolation is by CONSTRUCTION, not by mutation. Under `UNIT_TEST_MODE`, `storagePaths.graph`
        // is a formula resolving `graphTest` (`:memory:`) and `collections.*` resolve to generated
        // test names — both declared in `configBase.mjs`. This suite previously repointed all three
        // on the shared config singleton, so the writes bought nothing the harness had not already
        // provided; and only the graph path was ever handed back, leaving the two collection names
        // pointing at this suite's values for the remaining life of the worker.
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        mockFsRoot = path.join(tmpDir, `fs-ingest-mock-${process.pid}-${Date.now()}`);

        GraphService       = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        FileSystemIngestor = (await import('../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        const { TestLifecycleHelper } = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, fs, 'clear');

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // Build the mock filesystem
        fs.ensureDirSync(mockFsRoot);
        fs.ensureDirSync(path.join(mockFsRoot, 'src'));
        fs.ensureDirSync(path.join(mockFsRoot, 'docs', 'output', 'html'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'scss'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'images'));
        fs.ensureDirSync(path.join(mockFsRoot, 'node_modules', 'dep'));
        // Agent harness directories are runtime state and must not be indexed.
        // .claude/worktrees/<NAME>/ carries each Claude Code session's own multi-GB
        // node_modules + its own .neo-ai-data (recursive substrate amplification).
        // .codex/ carries Codex agent state similarly.
        fs.ensureDirSync(path.join(mockFsRoot, '.claude', 'worktrees', 'test-worktree', 'node_modules', 'transitive-dep'));
        fs.ensureDirSync(path.join(mockFsRoot, '.codex', 'sessions'));

        fs.writeFileSync(path.join(mockFsRoot, 'src', 'App.mjs'), 'export default {}');
        fs.writeFileSync(path.join(mockFsRoot, 'docs', 'output', 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(mockFsRoot, 'docs', 'output', 'html', 'nested.html'), '<html></html>');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'scss', 'theme.scss'), 'body {}');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'images', 'logo.png'), 'binary');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'images', 'icon.svg'), '<svg></svg>');
        fs.writeFileSync(path.join(mockFsRoot, 'node_modules', 'dep', 'index.js'), 'foo');
        fs.writeFileSync(path.join(mockFsRoot, '.env'), 'SECRET=123');
        fs.writeFileSync(path.join(mockFsRoot, 'package.json'), '{}');
        fs.symlinkSync('/etc/hosts', path.join(mockFsRoot, 'src', 'escape.mjs'));
        // Files inside agent harness directories must be excluded at the top-level
        // directory boundary; a nested `node_modules` filter alone is insufficient.
        fs.writeFileSync(path.join(mockFsRoot, '.claude', 'worktrees', 'test-worktree', 'node_modules', 'transitive-dep', 'index.js'), 'agent-harness-leak');
        fs.writeFileSync(path.join(mockFsRoot, '.codex', 'sessions', 'session.json'), '{"data":"codex-state"}');
    });

    test.beforeEach(async () => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(async () => {
        const { cleanupChromaManager, TestLifecycleHelper } = await import('./util.mjs');
        await cleanupChromaManager();

        // No config to hand back — nothing was mutated. The `'clear'` strategy never reads the path
        // argument: it clears the in-memory stores and calls `storage.clear()`.
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, null, fs, 'clear');

        fs.removeSync(mockFsRoot);
    });

    test('should resolve canonical projectable file identities and reject non-evidence paths', () => {
        expect(FileSystemIngestor.resolveFileReference('src/App.mjs', mockFsRoot)).toMatchObject({
            valid       : true,
            nodeId      : 'file-src/App.mjs',
            relativePath: 'src/App.mjs'
        });
        expect(FileSystemIngestor.resolveFileReference('../outside.mjs', mockFsRoot)).toMatchObject({
            valid: false,
            code : 'OUTSIDE_REPOSITORY'
        });
        expect(FileSystemIngestor.resolveFileReference('missing.mjs', mockFsRoot)).toMatchObject({
            valid: false,
            code : 'MISSING_FILE'
        });
        expect(FileSystemIngestor.resolveFileReference('src', mockFsRoot)).toMatchObject({
            valid: false,
            code : 'NOT_A_FILE'
        });
        expect(FileSystemIngestor.resolveFileReference('src/escape.mjs', mockFsRoot)).toMatchObject({
            valid: false,
            code : 'NOT_A_FILE'
        });
        expect(FileSystemIngestor.resolveFileReference('resources/images/logo.png', mockFsRoot)).toMatchObject({
            valid: false,
            code : 'IGNORED_FILE'
        });

        const
            aliasRoot   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-filesystem-resolver-alias-')),
            outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-filesystem-resolver-outside-'));

        try {
            fs.ensureDirSync(path.join(aliasRoot, 'real'));
            fs.ensureDirSync(path.join(aliasRoot, 'src'));
            fs.writeFileSync(path.join(aliasRoot, 'real', 'aliased.mjs'), 'export default true');
            fs.writeFileSync(path.join(aliasRoot, 'src', 'App.mjs'), 'export default true');
            fs.writeFileSync(path.join(outsideRoot, 'outside.mjs'), 'export default true');
            fs.symlinkSync(path.join(aliasRoot, 'real'), path.join(aliasRoot, 'alias'));
            fs.symlinkSync(outsideRoot, path.join(aliasRoot, 'outside-alias'));

            expect(FileSystemIngestor.resolveFileReference('alias/aliased.mjs', aliasRoot)).toMatchObject({
                valid: false,
                code : 'NON_CANONICAL_FILE_REFERENCE'
            });
            const outsideAlias = FileSystemIngestor.resolveFileReference('outside-alias/outside.mjs', aliasRoot);
            expect(outsideAlias).toMatchObject({valid: false, code: 'OUTSIDE_REPOSITORY'});
            expect(outsideAlias.nodeId).toBeUndefined();

            const wrongCase = FileSystemIngestor.resolveFileReference('SRC/App.mjs', aliasRoot);
            expect(wrongCase.valid).toBe(false);
            expect(['MISSING_FILE', 'NON_CANONICAL_FILE_REFERENCE']).toContain(wrongCase.code);
        } finally {
            fs.removeSync(aliasRoot);
            fs.removeSync(outsideRoot)
        }
    });

    test('should dynamically ignore high-noise path patterns while preserving structural mapping', async () => {
        const stats = {
            pathNodesUpserted: 0,
            edgesCreated     : 0,
            edgesVerified    : 0,
            edgesDrifted     : 0,
            edgesCulled      : 0,
            edgesUnavailable : 0
        };

        // Override walk logic root physically mimicking neoRootDir logic natively
        await FileSystemIngestor.walkDirectory(mockFsRoot, mockFsRoot, null, stats, new Map(), new Map());

        // Nodes: src, src/App.mjs, docs, resources, resources/scss, resources/scss/theme.scss, resources/images, package.json
        // NOTE: Relative paths here depend on CWD. In `walkDirectory`, it compares against `neoRootDir`,
        // meaning `path.relative(neoRootDir, fullPath)` will be evaluated.

        // Let's assert based on DB injection output to ensure structural Graph integrity exists natively
        const allNodes = GraphService.db.nodes.items.map(n => n.properties?.path).filter(Boolean);

        // SHOULD NOT BE PRESENT:
        expect(allNodes.some(p => p.includes('docs/output'))).toBe(false);
        expect(allNodes.some(p => p.includes('node_modules'))).toBe(false);
        expect(allNodes.some(p => p.includes('.env'))).toBe(false);
        expect(allNodes.some(p => p.includes('.png'))).toBe(false);
        expect(allNodes.some(p => p.includes('.svg'))).toBe(false);
        expect(allNodes.some(p => p.includes('escape.mjs'))).toBe(false);
        // Agent harness directories must be excluded before their nested state is
        // traversed; those paths do not begin with the generic `node_modules/` prefix.
        expect(allNodes.some(p => p.includes('.claude'))).toBe(false);
        expect(allNodes.some(p => p.includes('.codex'))).toBe(false);

        // SHOULD BE PRESENT:
        expect(allNodes.some(p => p.endsWith('src/App.mjs'))).toBe(true);
        expect(allNodes.some(p => p.endsWith('package.json'))).toBe(true);
        expect(allNodes.some(p => p.endsWith('resources/scss/theme.scss'))).toBe(true);

        // We verify that the edge connection `CONTAINS` works hierarchically:
        const srcNode  = GraphService.db.nodes.items.find(n => n.label === 'DIRECTORY' && n.properties.path.endsWith('src'));
        const fileNode = GraphService.db.nodes.items.find(n => n.label === 'FILE' && n.properties.path.endsWith('src/App.mjs'));

        expect(srcNode).toBeDefined();
        expect(fileNode).toBeDefined();
        expect(fileNode.id).toBe('file-src/App.mjs');
        expect(fileNode.properties.isConceptEdgeStub).toBe(false);

        const link = GraphService.db.edges.items.find(e => e.source === srcNode.id && e.target === fileNode.id);
        expect(link).toBeDefined();
        expect(link.type).toBe('CONTAINS');
    });

    test('re-verifies an unchanged tree without rewriting CONTAINS edges (#17056)', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-filesystem-idempotency-'));

        try {
            fs.ensureDirSync(path.join(root, 'left'));
            fs.ensureDirSync(path.join(root, 'right'));
            fs.writeFileSync(path.join(root, 'left', 'a.mjs'), 'export const a = true');
            fs.writeFileSync(path.join(root, 'right', 'b.mjs'), 'export const b = true');

            const
                sqlite    = GraphService.db.storage.db,
                readEdges = () => sqlite.prepare(`
                    SELECT id, source, target, type, data
                    FROM Edges
                    WHERE type = 'CONTAINS'
                    ORDER BY source, target, id
                `).all(),
                readEdgeLogs = () => sqlite.prepare("SELECT * FROM GraphLog WHERE entity_type = 'edges' ORDER BY log_id").all();

            const firstStats = await FileSystemIngestor.syncWorkspaceToGraph({rootDir: root});

            const firstEdges = readEdges();
            expect(firstStats).toEqual({
                status           : 'completed',
                pathNodesUpserted: 4,
                edgesCreated     : 4,
                edgesVerified    : 0,
                edgesDrifted     : 0,
                edgesCulled      : 0,
                edgesUnavailable : 0
            });
            expect(firstEdges).toHaveLength(4);

            sqlite.exec('DELETE FROM GraphLog');

            const secondStats = await FileSystemIngestor.syncWorkspaceToGraph({rootDir: root});

            expect(secondStats).toEqual({
                status           : 'completed',
                pathNodesUpserted: 0,
                edgesCreated     : 0,
                edgesVerified    : 4,
                edgesDrifted     : 0,
                edgesCulled      : 0,
                edgesUnavailable : 0
            });
            expect(readEdges()).toEqual(firstEdges);
            expect(readEdgeLogs()).toEqual([]);

            const beforeAdd = readEdges();
            fs.writeFileSync(path.join(root, 'left', 'new.mjs'), 'export const added = true');
            const changedAt = new Date(Date.now() + 2000);
            fs.utimesSync(path.join(root, 'left'), changedAt, changedAt);
            sqlite.exec('DELETE FROM GraphLog');

            const thirdStats = await FileSystemIngestor.syncWorkspaceToGraph({rootDir: root});

            const afterAdd  = readEdges();
            const addedEdge = afterAdd.find(edge => !beforeAdd.some(before => before.id === edge.id));

            expect(thirdStats).toEqual({
                status           : 'completed',
                pathNodesUpserted: 2,
                edgesCreated     : 1,
                edgesVerified    : 4,
                edgesDrifted     : 0,
                edgesCulled      : 0,
                edgesUnavailable : 0
            });
            expect(afterAdd).toHaveLength(5);
            expect(readEdgeLogs()).toEqual([
                expect.objectContaining({entity_id: addedEdge.id, entity_type: 'edges'})
            ]);
            expect(afterAdd.filter(edge => beforeAdd.some(before => before.id === edge.id))).toEqual(beforeAdd);
        } finally {
            fs.removeSync(root)
        }
    });
});
