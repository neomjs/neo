import {setup} from '../../../../../../setup.mjs';

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
import Neo                  from '../../../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../../../src/core/_export.mjs';
import InstanceManager      from '../../../../../../../../src/manager/Instance.mjs';
import fs                   from 'fs-extra';
import path                 from 'path';
import os                   from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.FileSystemIngestor', () => {
    let GraphService;
    let SystemLifecycleService;
    let FileSystemIngestor;
    const testDbName = `memory-core-fs-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;
    let mockFsRoot;

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
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

        GraphService       = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        FileSystemIngestor = (await import('../../../../../../../../ai/mcp/server/memory-core/services/FileSystemIngestor.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
        
        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
        }

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // Build the mock filesystem
        fs.ensureDirSync(mockFsRoot);
        fs.ensureDirSync(path.join(mockFsRoot, 'src'));
        fs.ensureDirSync(path.join(mockFsRoot, 'docs', 'output', 'html'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'scss'));
        fs.ensureDirSync(path.join(mockFsRoot, 'resources', 'images'));
        fs.ensureDirSync(path.join(mockFsRoot, 'node_modules', 'dep'));

        fs.writeFileSync(path.join(mockFsRoot, 'src', 'App.mjs'), 'export default {}');
        fs.writeFileSync(path.join(mockFsRoot, 'docs', 'output', 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(mockFsRoot, 'docs', 'output', 'html', 'nested.html'), '<html></html>');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'scss', 'theme.scss'), 'body {}');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'images', 'logo.png'), 'binary');
        fs.writeFileSync(path.join(mockFsRoot, 'resources', 'images', 'icon.svg'), '<svg></svg>');
        fs.writeFileSync(path.join(mockFsRoot, 'node_modules', 'dep', 'index.js'), 'foo');
        fs.writeFileSync(path.join(mockFsRoot, '.env'), 'SECRET=123');
        fs.writeFileSync(path.join(mockFsRoot, 'package.json'), '{}');
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
        const { cleanupChromaManager } = await import('../util.mjs');
        await cleanupChromaManager();

        // Per #10934 root-cause fix: do NOT close+null the GraphService singleton in afterAll.
        // The close cascades into "TypeError: database connection is not open" /
        // "Cannot read properties of undefined (reading exec)" failures across every sibling
        // spec that consumes the same singleton (GraphService.spec, Database.spec, PermissionService,
        // and others) under workers:1 because SDK lazy re-init breaks once GraphService.db is null.
        // Cleanup state via clear() instead — preserves the connection for subsequent specs while
        // dropping this spec's nodes/edges so test artifacts don't leak.
        if (GraphService?.db) {
            try { GraphService.db.nodes.clear(); }              catch (e) {};
            try { GraphService.db.edges.clear(); }              catch (e) {};
            try { GraphService.db.vicinityLoadedNodes.clear(); } catch (e) {};
            if (GraphService.db.storage?.db) {
                try { await GraphService.db.storage.clear(); } catch (e) {};
            }
        }

        fs.removeSync(mockFsRoot);
        fs.removeSync(testDbPath);
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
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
