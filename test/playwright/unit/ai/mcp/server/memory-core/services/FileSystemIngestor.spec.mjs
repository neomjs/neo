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
import fs                   from 'fs-extra';
import path                 from 'path';
import os                   from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.FileSystemIngestor', () => {
    let GraphService;
    let FileSystemIngestor;
    const testDbName = `memory-core-fs-test-${process.pid}-${Date.now()}.sqlite`;
    const testDbPath = path.join(os.tmpdir(), testDbName);

    // Create a mock filesystem directory structure to rigorously test isolation
    const mockFsRoot = path.join(os.tmpdir(), `fs-ingest-mock-${Date.now()}`);

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.engines.neo.dataDir  = os.tmpdir();
        aiConfig.engines.neo.filename = testDbName;

        GraphService       = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        FileSystemIngestor = (await import('../../../../../../../../ai/mcp/server/memory-core/services/FileSystemIngestor.mjs')).default;
        
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

        await GraphService.initAsync();

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

    test.afterAll(() => {
        if (GraphService?.db) {
            if (GraphService.db.storage && GraphService.db.storage.db) {
                try { GraphService.db.storage.db.close(); } catch (e) {};
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        fs.removeSync(mockFsRoot);
        fs.removeSync(testDbPath);
        try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
        try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
    });

    test('should dynamically ignore high-noise path patterns while preserving structural mapping', async () => {
        const stats = { nodes: 0, edges: 0 };

        // Override walk logic root physically mimicking neoRootDir logic natively
        FileSystemIngestor.walkDirectory(mockFsRoot, mockFsRoot, null, stats);

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
