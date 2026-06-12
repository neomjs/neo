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
    test.describe.configure({mode: 'serial'});

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
                },
                // Milestone metadata regression — object form (freshly fetched, post-API hydrate):
                // closed issue with milestone object persists as string title.
                '7910': {
                    state: 'CLOSED',
                    path: 'issues/v11.12.0/issue-7910.md',
                    closedAt: '2025-11-29T11:41:17Z',
                    updatedAt: '2025-11-29T11:44:14Z',
                    contentHash: 'hash7910',
                    commentsTotal: 1,
                    milestone: {title: '11.12.0'}
                },
                // Milestone metadata regression — string form (cached, carried forward from previous save):
                // `IssueSyncer.pullFromGitHub` seeds newMetadata.issues from existing serialized
                // metadata, then only overwrites fetched issues. Unchanged cached entries arrive at
                // save() with milestone already as a string. Naive `value.milestone?.title || null`
                // would prune to `null` here. String form MUST pass through verbatim.
                '7911': {
                    state: 'CLOSED',
                    path: 'issues/v11.13.0/issue-7911.md',
                    closedAt: '2025-11-29T12:00:00Z',
                    updatedAt: '2025-11-29T12:00:00Z',
                    contentHash: 'hash7911',
                    commentsTotal: 0,
                    milestone: '11.13.0'
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

        // Open issue without milestone persists as null (defensive)
        expect(loaded.issues['123'].milestone).toBeNull();

        // Milestone metadata regression: closed issue with object form persists as string title only.
        // Symmetric with IssueSyncer hydrate-from-disk path which wraps string back to {title: ...} object.
        expect(loaded.issues['7910'].milestone).toBe('11.12.0');
        expect(loaded.issues['7910'].state).toBe('CLOSED');
        expect(loaded.issues['7910'].path).toBe('issues/v11.12.0/issue-7910.md');

        // Milestone metadata regression: cached string-form milestone passes through verbatim.
        // Unchanged issues seeded from existing serialized metadata arrive as strings, not objects.
        // The prune MUST handle both shapes.
        expect(loaded.issues['7911'].milestone).toBe('11.13.0');
        expect(loaded.issues['7911'].state).toBe('CLOSED');

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
        // `archiveVersion` is retired — `save()` must prune it, never persist it.
        expect(loaded.pulls['789'].archiveVersion).toBeUndefined();
        expect(loaded.pulls['789'].contentHash).toBe('hash3');

        // Backward compat
        expect(loaded.pulls['790'].mergedAt).toBeUndefined();
        expect(loaded.pulls['790'].milestone).toBeUndefined();
        expect(loaded.pulls['790'].contentHash).toBe('hash3_legacy');
    });

    test('save() skips timestamp-only metadata writes (#10267)', async () => {
        const metadata = {
            lastSync: '2026-04-23T22:00:00Z',
            releasesLastFetched: '2026-04-23T22:00:00Z',
            pushFailures: [],
            issues: {
                '10267': {
                    state: 'OPEN',
                    path: 'issues/10267.md',
                    closedAt: null,
                    updatedAt: '2026-04-23T22:03:18Z',
                    contentHash: 'hash-10267',
                    commentsTotal: 0
                }
            },
            releases: {},
            pulls: {},
            discussions: {}
        };

        await MetadataManager.save(metadata);
        const originalContent = await fs.readFile(testMetadataFile, 'utf-8');

        await MetadataManager.save({
            ...metadata,
            lastSync: '2026-06-03T00:00:00Z',
            releasesLastFetched: '2026-06-03T00:00:00Z'
        });

        expect(await fs.readFile(testMetadataFile, 'utf-8')).toBe(originalContent);

        await MetadataManager.save({
            ...metadata,
            lastSync: '2026-06-03T00:00:00Z',
            releasesLastFetched: '2026-06-03T00:00:00Z',
            issues: {
                ...metadata.issues,
                '10267': {
                    ...metadata.issues['10267'],
                    contentHash: 'hash-10267-updated'
                }
            }
        });

        const loaded = await MetadataManager.load();

        expect(loaded.lastSync).toBe('2026-06-03T00:00:00Z');
        expect(loaded.releasesLastFetched).toBe('2026-06-03T00:00:00Z');
        expect(loaded.issues['10267'].contentHash).toBe('hash-10267-updated');
    });
});
