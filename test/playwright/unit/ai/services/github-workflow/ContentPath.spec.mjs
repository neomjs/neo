import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'ContentPathHelperTest'
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import os             from 'os';
import path           from 'path';

import contentPath, {
    chunkNumberFor,
    contentBucketDir,
    DEFAULT_CHUNK_PREFIX,
    DEFAULT_ITEMS_PER_CHUNK,
    validateBucketXor,
    validateNonNegativeInteger,
    validatePositiveInteger,
    validateSegment
} from '../../../../../../ai/services/github-workflow/shared/contentPath.mjs';
import {
    contentIndexPath,
    contentRootFor,
    createContentIndexEntry,
    findContentIndexEntry,
    readContentIndex,
    resolveIndexedPath,
    updateContentIndex
} from '../../../../../../ai/services/github-workflow/shared/contentIndex.mjs';

test.describe('contentPath — universal ordinal-100 path resolution (ADR 0004 §3.1 / #11379 Lane A)', () => {
    const contentRoot = path.join('resources', 'content');

    test.describe('active tier (no version/bucket)', () => {
        test('routes itemIndex 0 to chunk-1', () => {
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toBe(path.join(contentRoot, 'issues', 'chunk-1', 'issue-1.md'));
        });

        test('routes itemIndex 99 (last of chunk-1) to chunk-1', () => {
            expect(contentPath({
                contentRoot,
                type     : 'pulls',
                filename : 'pr-100.md',
                itemIndex: 99
            })).toBe(path.join(contentRoot, 'pulls', 'chunk-1', 'pr-100.md'));
        });

        test('routes itemIndex 100 (first of chunk-2) to chunk-2', () => {
            expect(contentPath({
                contentRoot,
                type     : 'discussions',
                filename : 'discussion-101.md',
                itemIndex: 100
            })).toBe(path.join(contentRoot, 'discussions', 'chunk-2', 'discussion-101.md'));
        });

        test('routes itemIndex 250 (mid chunk-3) to chunk-3', () => {
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-251.md',
                itemIndex: 250
            })).toBe(path.join(contentRoot, 'issues', 'chunk-3', 'issue-251.md'));
        });

        test('routes itemIndex 999 to chunk-10 (boundary at itemsPerChunk * 10)', () => {
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-1000.md',
                itemIndex: 999
            })).toBe(path.join(contentRoot, 'issues', 'chunk-10', 'issue-1000.md'));
        });

        test('routes itemIndex 1000 to chunk-11 (first item past chunk-10 boundary)', () => {
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-1001.md',
                itemIndex: 1000
            })).toBe(path.join(contentRoot, 'issues', 'chunk-11', 'issue-1001.md'));
        });

        test('handles release-notes type with semver-derived filename', () => {
            expect(contentPath({
                contentRoot,
                type     : 'release-notes',
                filename : 'release-12.1.0.md',
                itemIndex: 42
            })).toBe(path.join(contentRoot, 'release-notes', 'chunk-1', 'release-12.1.0.md'));
        });
    });

    test.describe('archive tier with version', () => {
        test('routes itemIndex 0 to chunk-1 under archive/{type}/{version}', () => {
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                version  : 'v13.0.0',
                filename : 'issue-11000.md',
                itemIndex: 0
            })).toBe(path.join(contentRoot, 'archive', 'issues', 'v13.0.0', 'chunk-1', 'issue-11000.md'));
        });

        test('routes itemIndex 250 to chunk-3 under archive/pulls/v12.1.0', () => {
            expect(contentPath({
                contentRoot,
                type     : 'pulls',
                version  : 'v12.1.0',
                filename : 'pr-999.md',
                itemIndex: 250
            })).toBe(path.join(contentRoot, 'archive', 'pulls', 'v12.1.0', 'chunk-3', 'pr-999.md'));
        });

        test('supports discussions in archive tier', () => {
            expect(contentPath({
                contentRoot,
                type     : 'discussions',
                version  : 'v13.0.0',
                filename : 'discussion-555.md',
                itemIndex: 50
            })).toBe(path.join(contentRoot, 'archive', 'discussions', 'v13.0.0', 'chunk-1', 'discussion-555.md'));
        });
    });

    test.describe('archive tier with bucket (non-release)', () => {
        test('routes pulls rejected bucket through chunk-N path', () => {
            expect(contentPath({
                contentRoot,
                type     : 'pulls',
                bucket   : 'rejected',
                filename : 'pr-11174.md',
                itemIndex: 0
            })).toBe(path.join(contentRoot, 'archive', 'pulls', 'rejected', 'chunk-1', 'pr-11174.md'));
        });

        test('chunks within bucket at itemsPerChunk boundary', () => {
            expect(contentPath({
                contentRoot,
                type     : 'pulls',
                bucket   : 'rejected',
                filename : 'pr-9999.md',
                itemIndex: 100
            })).toBe(path.join(contentRoot, 'archive', 'pulls', 'rejected', 'chunk-2', 'pr-9999.md'));
        });
    });

    test.describe('chunkPrefix + itemsPerChunk overrides', () => {
        test('honors non-default chunkPrefix', () => {
            expect(contentPath({
                contentRoot,
                type       : 'issues',
                filename   : 'issue-1.md',
                itemIndex  : 100,
                chunkPrefix: 'bucket-'
            })).toBe(path.join(contentRoot, 'issues', 'bucket-2', 'issue-1.md'));
        });

        test('honors non-default itemsPerChunk (50 → chunks earlier)', () => {
            expect(contentPath({
                contentRoot,
                type         : 'issues',
                filename     : 'issue-1.md',
                itemIndex    : 50,
                itemsPerChunk: 50
            })).toBe(path.join(contentRoot, 'issues', 'chunk-2', 'issue-1.md'));
        });

        test('honors non-default itemsPerChunk (200 → chunks later)', () => {
            expect(contentPath({
                contentRoot,
                type         : 'issues',
                filename     : 'issue-1.md',
                itemIndex    : 150,
                itemsPerChunk: 200
            })).toBe(path.join(contentRoot, 'issues', 'chunk-1', 'issue-1.md'));
        });
    });

    test.describe('validation failure modes', () => {
        test('rejects missing contentRoot', () => {
            expect(() => contentPath({
                type     : 'issues',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/contentRoot/);
        });

        test('rejects empty-string contentRoot', () => {
            expect(() => contentPath({
                contentRoot: '',
                type       : 'issues',
                filename   : 'issue-1.md',
                itemIndex  : 0
            })).toThrow(/contentRoot/);
        });

        test('rejects type containing a path separator', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues/nested',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/safe path segment/);
        });

        test('rejects type containing ..', () => {
            expect(() => contentPath({
                contentRoot,
                type     : '..',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/safe path segment/);
        });

        test('rejects filename containing a path separator', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'nested/issue-1.md',
                itemIndex: 0
            })).toThrow(/safe path segment/);
        });

        test('rejects negative itemIndex', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-1.md',
                itemIndex: -1
            })).toThrow(/non-negative integer/);
        });

        test('rejects non-integer itemIndex', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                filename : 'issue-1.md',
                itemIndex: 1.5
            })).toThrow(/non-negative integer/);
        });

        test('rejects zero itemsPerChunk', () => {
            expect(() => contentPath({
                contentRoot,
                type         : 'issues',
                filename     : 'issue-1.md',
                itemIndex    : 0,
                itemsPerChunk: 0
            })).toThrow(/positive integer/);
        });

        test('rejects negative itemsPerChunk', () => {
            expect(() => contentPath({
                contentRoot,
                type         : 'issues',
                filename     : 'issue-1.md',
                itemIndex    : 0,
                itemsPerChunk: -10
            })).toThrow(/positive integer/);
        });

        test('rejects supplying both version and bucket', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                version  : 'v13.0.0',
                bucket   : 'rejected',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/zero or one of version or bucket/);
        });

        test('rejects chunkPrefix containing a path separator', () => {
            expect(() => contentPath({
                contentRoot,
                type       : 'issues',
                filename   : 'issue-1.md',
                itemIndex  : 0,
                chunkPrefix: 'bad/prefix'
            })).toThrow(/chunkPrefix/);
        });
    });

    // Presence-aware validation suite (per #11381 GPT review RA1): supplying `version: ''` or
    // `bucket: ''` must fail-loud as non-empty-string violations rather than silently routing to
    // active-tier. Distinguishes key-not-supplied (`undefined`/`null`) from key-supplied-as-empty.
    test.describe('presence-aware archive-selector validation (RA1)', () => {
        test('rejects supplied-empty version with explicit non-empty-string error', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                version  : '',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/version must be a non-empty string/);
        });

        test('rejects supplied-empty bucket with explicit non-empty-string error', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'pulls',
                bucket   : '',
                filename : 'pr-1.md',
                itemIndex: 0
            })).toThrow(/bucket must be a non-empty string/);
        });

        test('rejects both version and bucket supplied even when both are empty strings', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'issues',
                version  : '',
                bucket   : '',
                filename : 'issue-1.md',
                itemIndex: 0
            })).toThrow(/zero or one of version or bucket/);
        });

        test('rejects mixed supplied-empty (version empty, bucket non-empty) as XOR violation', () => {
            expect(() => contentPath({
                contentRoot,
                type     : 'pulls',
                version  : '',
                bucket   : 'rejected',
                filename : 'pr-1.md',
                itemIndex: 0
            })).toThrow(/zero or one of version or bucket/);
        });

        test('contentBucketDir also rejects supplied-empty version', () => {
            expect(() => contentBucketDir({
                contentRoot,
                type   : 'pulls',
                version: ''
            })).toThrow(/version must be a non-empty string/);
        });

        test('contentBucketDir also rejects supplied-empty bucket', () => {
            expect(() => contentBucketDir({
                contentRoot,
                type  : 'pulls',
                bucket: ''
            })).toThrow(/bucket must be a non-empty string/);
        });

        test('contentBucketDir treats both-supplied-empty as XOR violation', () => {
            expect(() => contentBucketDir({
                contentRoot,
                type   : 'pulls',
                version: '',
                bucket : ''
            })).toThrow(/zero or one of version or bucket/);
        });

        test('validateBucketXor is presence-aware (rejects both-supplied even when both empty)', () => {
            expect(() => validateBucketXor({version: '', bucket: ''}))
                .toThrow(/zero or one of version or bucket/);
        });

        test('validateBucketXor still permits undefined (active-tier path remains legitimate)', () => {
            expect(() => validateBucketXor({})).not.toThrow();
            expect(() => validateBucketXor({version: undefined, bucket: undefined})).not.toThrow();
        });

        test('null is treated as "not supplied" (consistent with undefined)', () => {
            // Defensive: callers that JSON-deserialize may produce null for omitted keys
            expect(contentPath({
                contentRoot,
                type     : 'issues',
                version  : null,
                bucket   : null,
                filename : 'issue-1.md',
                itemIndex: 0
            })).toBe(path.join(contentRoot, 'issues', 'chunk-1', 'issue-1.md'));
        });
    });

    test.describe('chunkNumberFor helper', () => {
        test('returns 1 for itemIndex 0', () => {
            expect(chunkNumberFor(0)).toBe(1);
        });

        test('returns 1 for itemIndex 99 (last of chunk-1)', () => {
            expect(chunkNumberFor(99)).toBe(1);
        });

        test('returns 2 for itemIndex 100 (first of chunk-2)', () => {
            expect(chunkNumberFor(100)).toBe(2);
        });

        test('returns 11 for itemIndex 1000', () => {
            expect(chunkNumberFor(1000)).toBe(11);
        });

        test('honors itemsPerChunk override', () => {
            expect(chunkNumberFor(49, 50)).toBe(1);
            expect(chunkNumberFor(50, 50)).toBe(2);
            expect(chunkNumberFor(199, 200)).toBe(1);
            expect(chunkNumberFor(200, 200)).toBe(2);
        });

        test('rejects negative itemIndex', () => {
            expect(() => chunkNumberFor(-1)).toThrow(/non-negative integer/);
        });
    });

    test.describe('contentBucketDir helper', () => {
        test('returns active-tier bucket dir without chunk/filename', () => {
            expect(contentBucketDir({
                contentRoot,
                type: 'issues'
            })).toBe(path.join(contentRoot, 'issues'));
        });

        test('returns archive-tier version bucket dir', () => {
            expect(contentBucketDir({
                contentRoot,
                type   : 'pulls',
                version: 'v12.1.0'
            })).toBe(path.join(contentRoot, 'archive', 'pulls', 'v12.1.0'));
        });

        test('returns archive-tier non-release bucket dir', () => {
            expect(contentBucketDir({
                contentRoot,
                type  : 'pulls',
                bucket: 'rejected'
            })).toBe(path.join(contentRoot, 'archive', 'pulls', 'rejected'));
        });

        test('rejects supplying both version and bucket', () => {
            expect(() => contentBucketDir({
                contentRoot,
                type   : 'pulls',
                version: 'v13.0.0',
                bucket : 'rejected'
            })).toThrow(/zero or one of version or bucket/);
        });
    });

    test.describe('exported constants', () => {
        test('DEFAULT_ITEMS_PER_CHUNK equals 100 per ADR 0004 §2.2', () => {
            expect(DEFAULT_ITEMS_PER_CHUNK).toBe(100);
        });

        test('DEFAULT_CHUNK_PREFIX equals "chunk-"', () => {
            expect(DEFAULT_CHUNK_PREFIX).toBe('chunk-');
        });
    });

    test.describe('exported validators (lift-targets for sibling primitives)', () => {
        test('validateSegment accepts safe single segments', () => {
            expect(() => validateSegment('issues', 'type')).not.toThrow();
            expect(() => validateSegment('v13.0.0', 'version')).not.toThrow();
        });

        test('validateSegment with allowPath accepts path-shaped values', () => {
            expect(() => validateSegment(path.join('a', 'b'), 'contentRoot', {allowPath: true})).not.toThrow();
        });

        test('validateNonNegativeInteger accepts 0 and positives, rejects negatives + non-integers', () => {
            expect(() => validateNonNegativeInteger(0, 'x')).not.toThrow();
            expect(() => validateNonNegativeInteger(42, 'x')).not.toThrow();
            expect(() => validateNonNegativeInteger(-1, 'x')).toThrow();
            expect(() => validateNonNegativeInteger(1.5, 'x')).toThrow();
        });

        test('validatePositiveInteger rejects 0', () => {
            expect(() => validatePositiveInteger(0, 'x')).toThrow();
            expect(() => validatePositiveInteger(1, 'x')).not.toThrow();
        });

        test('validateBucketXor permits neither supplied (active tier path)', () => {
            expect(() => validateBucketXor({})).not.toThrow();
        });

        test('validateBucketXor permits exactly one supplied', () => {
            expect(() => validateBucketXor({version: 'v13.0.0'})).not.toThrow();
            expect(() => validateBucketXor({bucket: 'rejected'})).not.toThrow();
        });

        test('validateBucketXor rejects both supplied', () => {
            expect(() => validateBucketXor({version: 'v13.0.0', bucket: 'rejected'}))
                .toThrow(/zero or one of version or bucket/);
        });
    });
});

test.describe('contentIndex — ADR 0004 _index.json maintenance (#11390 Lane B)', () => {
    let tmpRoot;
    let issueSyncConfig;

    test.beforeEach(async () => {
        tmpRoot = path.join(os.tmpdir(), `neo-content-index-test-${process.pid}-${Date.now()}`);
        issueSyncConfig = {
            issuesDir: path.join(tmpRoot, 'issues')
        };
        await fs.ensureDir(issueSyncConfig.issuesDir);
    });

    test.afterEach(async () => {
        await fs.remove(tmpRoot).catch(() => {});
    });

    test('derives the content root and index path from issuesDir', () => {
        expect(contentRootFor(issueSyncConfig)).toBe(tmpRoot);
        expect(contentIndexPath(issueSyncConfig)).toBe(path.join(tmpRoot, '_index.json'));
    });

    test('upserts, sorts, finds, and removes entries', async () => {
        const issuePath = path.join(tmpRoot, 'issues', 'chunk-1', 'issue-5.md');
        const prPath    = path.join(tmpRoot, 'pulls', 'chunk-1', 'pr-2.md');

        await updateContentIndex(issueSyncConfig, {
            upsert: [
                createContentIndexEntry({
                    issueSyncConfig,
                    type     : 'issues',
                    id       : 5,
                    filePath : issuePath,
                    itemIndex: 0
                }),
                createContentIndexEntry({
                    issueSyncConfig,
                    type     : 'pulls',
                    id       : 2,
                    filePath : prPath,
                    itemIndex: 0
                })
            ]
        });

        let index = await readContentIndex(issueSyncConfig);
        expect(index.map(entry => `${entry.type}:${entry.id}`)).toEqual(['issues:5', 'pulls:2']);
        expect(findContentIndexEntry(index, {type: 'issues', id: '5'}).path).toBe(path.join('issues', 'chunk-1', 'issue-5.md'));

        await updateContentIndex(issueSyncConfig, {
            remove: [{type: 'issues', id: 5}]
        });

        index = await readContentIndex(issueSyncConfig);
        expect(findContentIndexEntry(index, {type: 'issues', id: 5})).toBeNull();
        expect(index.map(entry => `${entry.type}:${entry.id}`)).toEqual(['pulls:2']);
    });

    test('resolves indexed paths inside the content root and rejects escapes', () => {
        expect(resolveIndexedPath(issueSyncConfig, {
            type: 'issues', id: 1, version: null, chunkNumber: 1, path: path.join('issues', 'chunk-1', 'issue-1.md')
        })).toBe(path.join(tmpRoot, 'issues', 'chunk-1', 'issue-1.md'));

        expect(() => resolveIndexedPath(issueSyncConfig, {
            type: 'issues', id: 1, version: null, chunkNumber: 1, path: '../outside.md'
        })).toThrow(/content root/);
    });
});
