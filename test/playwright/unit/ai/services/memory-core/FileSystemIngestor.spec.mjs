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

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import InstanceManager      from '../../../../../../src/manager/Instance.mjs';
import fs                   from 'fs-extra';
import path                 from 'path';
import os                   from 'os';

test.describe('Neo.ai.services.memory-core.FileSystemIngestor', () => {
    let GraphService;
    let SystemLifecycleService;
    let FileSystemIngestor;
    const testDbName = `memory-core-fs-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    let mockFsRoot;
    let originalDbPath;

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        originalDbPath = aiConfig.storagePaths.graph;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);
        mockFsRoot = path.join(tmpDir, `fs-ingest-mock-${Date.now()}`);

        aiConfig.storagePaths.graph = testDbPath;
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${Date.now()}`;
        aiConfig.collections.session = `test-session-${Date.now()}`;

        GraphService       = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        FileSystemIngestor = (await import('../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        const { TestLifecycleHelper } = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // Build the mock filesystem
        fs.ensureDirSync(mockFsRoot);
        fs.ensureDirSync(path.join(mockFsRoot, 'src'));
        fs.ensureDirSync(path.join(mockFsRoot, 'docs', 'output', 'html'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'scss'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'images'));
        fs.ensureDirSync(path.join(mockFsRoot, 'node_modules', 'dep'));
        // Agent harness directories — neither should be indexed (#11650).
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
        // Files inside the agent harness directories — would have leaked under the
        // pre-#11650 path-prefix matcher because relativePath starts with `.claude/`
        // or `.codex/`, not with `node_modules/`. Adding `.claude` + `.codex` to the
        // top-level ignorePatterns is the surgical fix.
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

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = originalDbPath;

        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');

        fs.removeSync(mockFsRoot);
    });

    test('should dynamically ignore high-noise path patterns while preserving structural mapping', async () => {
        const stats = { nodes: 0, edges: 0 };

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
        // Agent harness directories must be excluded (#11650). Pre-#11650 the
        // path-prefix matcher caught only root-level node_modules; nested
        // .claude/worktrees/<X>/node_modules slipped through because the path
        // doesn't start with `node_modules/` — it starts with `.claude/`.
        expect(allNodes.some(p => p.includes('.claude'))).toBe(false);
        expect(allNodes.some(p => p.includes('.codex'))).toBe(false);

        // SHOULD BE PRESENT:
        expect(allNodes.some(p => p.endsWith('src/App.mjs'))).toBe(true);
        expect(allNodes.some(p => p.endsWith('package.json'))).toBe(true);
        expect(allNodes.some(p => p.endsWith('resources/scss/theme.scss'))).toBe(true);

        // We verify that the edge connection `CONTAINS` works hierarchically:
        const srcNode = GraphService.db.nodes.items.find(n => n.label === 'DIRECTORY' && n.properties.path.endsWith('src'));
        const fileNode = GraphService.db.nodes.items.find(n => n.label === 'FILE' && n.properties.path.endsWith('src/App.mjs'));

        expect(srcNode).toBeDefined();
        expect(fileNode).toBeDefined();

        const link = GraphService.db.edges.items.find(e => e.source === srcNode.id && e.target === fileNode.id);
        expect(link).toBeDefined();
        expect(link.type).toBe('CONTAINS');
    });
});
