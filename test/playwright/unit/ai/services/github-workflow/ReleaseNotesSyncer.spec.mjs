import {setup} from '../../../../setup.mjs';

const appName = 'ReleaseNotesSyncerTest';

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

test.describe('Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer', () => {
    let ReleaseNotesSyncer;
    let GraphqlService;
    let issueSyncConfig;
    let aiConfig;
    let originalQuery;
    let originalContentRoot;
    let tmpRoot;
    let logger;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        issueSyncConfig = aiConfig.issueSync;
        originalContentRoot = issueSyncConfig.contentRoot;

        tmpRoot = path.resolve(process.cwd(), 'tmp', `release-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpRoot);

        issueSyncConfig.contentRoot = tmpRoot;

        ReleaseNotesSyncer = (await import('../../../../../../ai/services/github-workflow/sync/ReleaseNotesSyncer.mjs')).default;
        GraphqlService     = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;

        logger = (await import('../../../../../../ai/mcp/server/github-workflow/logger.mjs')).default;
        logger.level = 'silent';

        originalQuery = GraphqlService.query;
    });

    test.afterAll(async () => {
        issueSyncConfig.contentRoot = originalContentRoot;
        GraphqlService.query = originalQuery;
        await fs.remove(tmpRoot);
    });

    test.afterEach(() => {
        GraphqlService.query = originalQuery;
    });

    test('warm-cache path properly hydrates sortedReleases and skips full fetch', async () => {
        const metadata = {
            releases: {
                'v1.0.0': { tagName: 'v1.0.0', publishedAt: '2024-01-01T00:00:00Z', contentHash: 'hash1' },
                'v1.1.0': { tagName: 'v1.1.0', publishedAt: '2024-02-01T00:00:00Z', contentHash: 'hash2' }
            }
        };

        // Mock GraphqlService to only return the latest release
        let queryCallCount = 0;
        GraphqlService.query = async (queryName, variables) => {
            queryCallCount++;
            return {
                repository: {
                    latestRelease: { tagName: 'v1.1.0', publishedAt: '2024-02-01T00:00:00Z' }
                }
            };
        };

        const syncer = InstanceManager.get('Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer');
        await syncer.fetchAndCacheReleases(metadata);

        // It should have hit the quick-check and returned without doing full pagination
        expect(queryCallCount).toBe(1);

        // Crucially, it must have populated sortedReleases
        expect(syncer.sortedReleases).toEqual([
            { tagName: 'v1.0.0', publishedAt: '2024-01-01T00:00:00Z' },
            { tagName: 'v1.1.0', publishedAt: '2024-02-01T00:00:00Z' }
        ]);
        expect(syncer.releases).toEqual(metadata.releases);
    });

    test('syncNotes generates ordinal pathing and updates _index.json correctly', async () => {
        const syncer = InstanceManager.get('Neo.ai.services.github-workflow.sync.ReleaseNotesSyncer');
        
        syncer.releases = {
            'v1.0.0': { tagName: 'v1.0.0', name: 'Release 1', publishedAt: '2024-01-01T00:00:00Z', description: 'First release' },
            'v1.1.0': { tagName: 'v1.1.0', name: 'Release 2', publishedAt: '2024-02-01T00:00:00Z', description: 'Second release' }
        };
        syncer.sortedReleases = [
            { tagName: 'v1.0.0', publishedAt: '2024-01-01T00:00:00Z' },
            { tagName: 'v1.1.0', publishedAt: '2024-02-01T00:00:00Z' }
        ];

        // Ensure the directory is clean
        const releaseDir = path.join(tmpRoot, 'release-notes');
        await fs.emptyDir(releaseDir);

        const stats = await syncer.syncNotes({});
        expect(stats.count).toBe(2);

        // Check ordinal chunk paths
        // v1.0.0 -> index 0 -> chunk 1 -> chunk-1/v1.0.0.md
        // v1.1.0 -> index 1 -> chunk 1 -> chunk-1/v1.1.0.md
        const file1Exists = await fs.pathExists(path.join(releaseDir, 'chunk-1', 'v1.0.0.md'));
        const file2Exists = await fs.pathExists(path.join(releaseDir, 'chunk-1', 'v1.1.0.md'));
        expect(file1Exists).toBe(true);
        expect(file2Exists).toBe(true);

        // Check _index.json
        const indexPath = path.join(releaseDir, '_index.json');
        expect(await fs.pathExists(indexPath)).toBe(true);
        
        const indexData = await fs.readJson(indexPath);
        expect(indexData.items['v1.0.0']).toEqual({ itemIndex: 0, chunk: 1, chunkDir: 'chunk-1' });
        expect(indexData.items['v1.1.0']).toEqual({ itemIndex: 1, chunk: 1, chunkDir: 'chunk-1' });
    });
});
