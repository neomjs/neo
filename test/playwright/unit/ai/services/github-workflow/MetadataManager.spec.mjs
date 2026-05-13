import {setup} from '../../../../setup.mjs';

const appName = 'MetadataManagerTest';

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
import fs              from 'fs/promises';
import path            from 'path';
import os              from 'os';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

test.describe('Neo.ai.services.github-workflow.sync.MetadataManager', () => {
    let MetadataManager;
    let aiConfig;
    let originalMetadataFile;
    let testMetadataFile;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        originalMetadataFile = aiConfig.issueSync.metadataFile;
        testMetadataFile = path.join(os.tmpdir(), `neo-metadata-manager-test-${Date.now()}.json`);
        aiConfig.issueSync.metadataFile = testMetadataFile;

        MetadataManager = (await import('../../../../../../ai/services/github-workflow/sync/MetadataManager.mjs')).default;
    });

    test.afterAll(async () => {
        aiConfig.issueSync.metadataFile = originalMetadataFile;
        try {
            await fs.unlink(testMetadataFile);
        } catch (e) {
            // ignore if not found
        }
    });

    test('save() preserves specific fields for discussions and pulls, and maintains backward compatibility', async () => {
        const metadata = {
            lastSync: '2026-05-13T00:00:00Z',
            releasesLastFetched: '2026-05-13T00:00:00Z',
            issues: {
                '123': {
                    state: 'OPEN',
                    path: 'issues/123.md',
                    closedAt: null,
                    updatedAt: '2026-05-13T00:00:00Z',
                    contentHash: 'hash1',
                    commentsTotal: 5,
                    extraFieldShouldBePruned: true
                }
            },
            discussions: {
                '456': {
                    number: 456,
                    path: 'discussions/456.md',
                    closed: true,
                    closedAt: '2026-05-13T00:00:00Z',
                    contentHash: 'hash2',
                    extraFieldShouldBePruned: true
                },
                '457': {
                    // Backward compatibility: existing metadata might not have path/closed
                    number: 457,
                    contentHash: 'hash2_legacy'
                }
            },
            pulls: {
                '789': {
                    state: 'MERGED',
                    path: 'pulls/789.md',
                    closedAt: '2026-05-13T00:00:00Z',
                    mergedAt: '2026-05-13T00:00:00Z',
                    milestone: 'v1.0.0',
                    archiveVersion: 'v1.0.0',
                    updatedAt: '2026-05-13T00:00:00Z',
                    contentHash: 'hash3',
                    extraFieldShouldBePruned: true
                },
                '790': {
                     // Backward compatibility: existing metadata might not have mergedAt/milestone
                     state: 'OPEN',
                     updatedAt: '2026-05-13T00:00:00Z',
                     contentHash: 'hash3_legacy'
                }
            }
        };

        await MetadataManager.save(metadata);

        const loaded = await MetadataManager.load();

        // Issues
        expect(loaded.issues['123'].extraFieldShouldBePruned).toBeUndefined();
        expect(loaded.issues['123'].contentHash).toBe('hash1');

        // Discussions
        expect(loaded.discussions['456'].extraFieldShouldBePruned).toBeUndefined();
        expect(loaded.discussions['456'].path).toBe('discussions/456.md');
        expect(loaded.discussions['456'].closed).toBe(true);
        expect(loaded.discussions['456'].closedAt).toBe('2026-05-13T00:00:00Z');
        expect(loaded.discussions['456'].contentHash).toBe('hash2');

        // Backward compat
        expect(loaded.discussions['457'].path).toBeUndefined();
        expect(loaded.discussions['457'].closed).toBeUndefined();
        expect(loaded.discussions['457'].contentHash).toBe('hash2_legacy');

        // Pulls
        expect(loaded.pulls['789'].extraFieldShouldBePruned).toBeUndefined();
        expect(loaded.pulls['789'].mergedAt).toBe('2026-05-13T00:00:00Z');
        expect(loaded.pulls['789'].milestone).toBe('v1.0.0');
        expect(loaded.pulls['789'].archiveVersion).toBe('v1.0.0');
        expect(loaded.pulls['789'].contentHash).toBe('hash3');

        // Backward compat
        expect(loaded.pulls['790'].mergedAt).toBeUndefined();
        expect(loaded.pulls['790'].milestone).toBeUndefined();
        expect(loaded.pulls['790'].contentHash).toBe('hash3_legacy');
    });
});
