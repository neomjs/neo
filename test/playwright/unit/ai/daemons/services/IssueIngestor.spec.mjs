import {setup} from '../../../../setup.mjs';

const appName = 'IssueIngestorTest';

setup({
    neoConfig: { unitTestMode: true },
    appConfig: { name: appName, isMounted: () => true, vnodeInitialising: false }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../../..');

test.describe('Neo.ai.daemons.services.IssueIngestor', () => {
    let IssueIngestor;
    let _originalExistsSync;
    let _originalReaddir;
    let _originalReadFile;
    let GraphService;
    let _originalGraphDb;

    // We will use a mock index.json and mock markdown files
    const mockIndexMap = [
        { type: 'issues', id: 2001, path: 'issues/issue-2001.md' },
        { type: 'issues', id: 2002, path: 'archive/issues/v1.0.0/issue-2002.md' }
    ];

    const mockFiles = {
        'resources/content/issues/issue-2001.md': '---\nstate: OPEN\n---\n# Active Issue',
        'resources/content/archive/issues/v1.0.0/issue-2002.md': '---\nstate: CLOSED\n---\n# Archive Issue',
        'resources/content/_index.json': JSON.stringify(mockIndexMap)
    };

    test.beforeAll(async () => {
        IssueIngestor = (await import('../../../../../../ai/daemons/services/IssueIngestor.mjs')).default;
        GraphService = (await import('../../../../../../ai/services.mjs')).Memory_GraphService;

        _originalGraphDb = GraphService.db;
        GraphService.db = {
            nodes: { get: () => null },
            edges: { items: [] },
            getAdjacentNodes: () => {},
            addNode: () => {},
            updateNode: () => {}
        };

        _originalExistsSync = fs.existsSync;
        _originalReaddir = fs.promises.readdir;
        _originalReadFile = fs.promises.readFile;

        fs.existsSync = (p) => {
            if (typeof p === 'string' && p.includes('resources/content')) {
                const normPath = p.replace(/\\/g, '/');
                for (const key of Object.keys(mockFiles)) {
                    if (normPath.endsWith(key)) return true;
                }
                if (p.endsWith('.md')) return true;
                if (!p.endsWith('.json')) return true; // Pretend directories exist
                return false;
            }
            return _originalExistsSync(p);
        };

        fs.promises.readdir = async (dirPath, options) => {
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/archive/issues')) {
                return ['v1.0.0/issue-2002.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/issues')) {
                return ['issue-2001.md'];
            }
            if (typeof dirPath === 'string' && dirPath.includes('resources/content/discussions') || dirPath.includes('resources/content/pulls')) {
                return [];
            }
            return _originalReaddir.call(fs.promises, dirPath, options);
        };

        fs.promises.readFile = async (filePath, encoding) => {
            if (typeof filePath === 'string') {
                const normPath = filePath.replace(/\\/g, '/');
                for (const key of Object.keys(mockFiles)) {
                    if (normPath.endsWith(key)) {
                        return mockFiles[key];
                    }
                }
                console.log('Not mocked:', normPath);
            }
            return _originalReadFile.call(fs.promises, filePath, encoding);
        };
    });

    test.afterAll(() => {
        fs.existsSync = _originalExistsSync;
        fs.promises.readdir = _originalReaddir;
        fs.promises.readFile = _originalReadFile;
        if (GraphService) {
            GraphService.db = _originalGraphDb;
        }
    });

    test('ingestIssueStates() maps issues correctly through _index.json', async () => {
        const { Memory_StorageRouter: StorageRouter } = await import('../../../../../../ai/services.mjs');
        const _originalGetGraphCollection = StorageRouter.getGraphCollection;
        StorageRouter.getGraphCollection = async () => ({
            upsert: async () => {},
            get: async () => ({ ids: [], metadatas: [], documents: [] }),
            add: async () => {}
        });

        try {
            // Mock out global StorageRouter if it exists, but the ingestor doesn't throw if null
            // we will just see what comes out as returned open issues
            const result = await IssueIngestor.ingestIssueStates();

            // Verify that open issue was identified
            expect(result.length).toBe(1);
            expect(result[0].issueId).toBe('issue-2001');
        } finally {
            StorageRouter.getGraphCollection = _originalGetGraphCollection;
        }
    });
});
