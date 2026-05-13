import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: 'ArchivePathHelperTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import path           from 'path';

import archivePath, {
    archiveBucketDir,
    DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR,
    validateArchiveConfig
} from '../../../../../../ai/services/github-workflow/shared/archivePath.mjs';
import chunkPath from '../../../../../../ai/services/github-workflow/shared/chunkPath.mjs';

test.describe('GitHub workflow archivePath helper', () => {
    const archiveRoot = path.join('resources', 'content', 'archive');

    test('keeps empty and small release buckets flat through 100 items', () => {
        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-empty.md',
            itemCount: 0
        })).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'issue-empty.md'));

        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-1.md',
            itemCount: 1
        })).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'issue-1.md'));

        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-11190.md',
            itemCount: 100
        })).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'issue-11190.md'));
    });

    test('routes ordinal archive chunks when the planned bucket exceeds 100 items', () => {
        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-11000.md',
            itemCount: 101,
            itemIndex: 0
        })).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'chunk-1', 'issue-11000.md'));

        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-11100.md',
            itemCount: 101,
            itemIndex: 100
        })).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'chunk-2', 'issue-11100.md'));
    });

    test('supports non-release archive buckets such as rejected pull requests', () => {
        expect(archivePath({
            archiveRoot,
            type     : 'pulls',
            bucket   : 'rejected',
            filename : 'pr-11174.md',
            itemCount: 1
        })).toBe(path.join(archiveRoot, 'pulls', 'rejected', 'pr-11174.md'));
    });

    test('builds archive bucket directories without filenames', () => {
        expect(archiveBucketDir({
            archiveRoot,
            type   : 'discussions',
            version: 'v13.0.0'
        })).toBe(path.join(archiveRoot, 'discussions', 'v13.0.0'));
    });

    test('rejects ambiguous or unsafe inputs', () => {
        expect(() => archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            bucket   : 'rejected',
            filename : 'issue-1.md',
            itemCount: 1
        })).toThrow(/exactly one/);

        expect(() => archivePath({
            archiveRoot,
            type     : 'issues/nested',
            version  : 'v13.0.0',
            filename : 'issue-1.md',
            itemCount: 1
        })).toThrow(/safe path segment/);

        expect(() => archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-1.md',
            itemCount: DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR + 1
        })).toThrow(/itemIndex/);

        expect(() => archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-1.md',
            itemCount: 1,
            itemIndex: 1
        })).toThrow(/smaller than itemCount/);
    });

    test('does not alter active-tier ID-range chunking semantics', () => {
        expect(chunkPath(11190)).toBe('111xx');

        expect(archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-11190.md',
            itemCount: 101,
            itemIndex: 100
        })).toContain(`${path.sep}chunk-2${path.sep}`);
    });
});

test.describe('validateArchiveConfig — Epic #11187 B0a (#11290) runtime config validation', () => {
    const validConfig = {
        archiveRoot          : path.join('resources', 'content', 'archive'),
        archiveChunkThreshold: 100,
        archiveChunkPrefix   : 'chunk-'
    };

    test('passes for fully-valid config', () => {
        expect(() => validateArchiveConfig(validConfig)).not.toThrow();
    });

    test('fails loudly with missing archiveRoot', () => {
        const config = {...validConfig};
        delete config.archiveRoot;
        expect(() => validateArchiveConfig(config)).toThrow(/issueSync\.archiveRoot/);
    });

    test('fails loudly with missing archiveChunkThreshold', () => {
        const config = {...validConfig};
        delete config.archiveChunkThreshold;
        expect(() => validateArchiveConfig(config)).toThrow(/issueSync\.archiveChunkThreshold/);
    });

    test('fails loudly with missing archiveChunkPrefix', () => {
        const config = {...validConfig};
        delete config.archiveChunkPrefix;
        expect(() => validateArchiveConfig(config)).toThrow(/issueSync\.archiveChunkPrefix/);
    });

    test('reproduces the 2026-05-13 partial-patch state (archiveRoot present, chunk fields missing)', () => {
        const config = {archiveRoot: validConfig.archiveRoot};
        // Both chunkThreshold AND chunkPrefix missing — single throw aggregates both
        let captured;
        try {
            validateArchiveConfig(config);
        } catch (e) {
            captured = e;
        }
        expect(captured).toBeDefined();
        expect(captured.message).toMatch(/issueSync\.archiveChunkThreshold/);
        expect(captured.message).toMatch(/issueSync\.archiveChunkPrefix/);
    });

    test('rejects empty-string archiveRoot', () => {
        expect(() => validateArchiveConfig({...validConfig, archiveRoot: ''}))
            .toThrow(/non-empty string/);
    });

    test('rejects non-integer archiveChunkThreshold', () => {
        expect(() => validateArchiveConfig({...validConfig, archiveChunkThreshold: 100.5}))
            .toThrow(/positive integer/);
    });

    test('rejects zero archiveChunkThreshold', () => {
        expect(() => validateArchiveConfig({...validConfig, archiveChunkThreshold: 0}))
            .toThrow(/positive integer/);
    });

    test('rejects negative archiveChunkThreshold', () => {
        expect(() => validateArchiveConfig({...validConfig, archiveChunkThreshold: -1}))
            .toThrow(/positive integer/);
    });

    test('rejects null/undefined config object gracefully', () => {
        expect(() => validateArchiveConfig(null)).toThrow(/issueSync\.archiveRoot/);
        expect(() => validateArchiveConfig(undefined)).toThrow(/issueSync\.archiveRoot/);
    });

    test('error message names file surface + ticket for operator-actionability', () => {
        expect(() => validateArchiveConfig({}))
            .toThrow(/ai\/mcp\/server\/github-workflow\/config\.mjs/);
        expect(() => validateArchiveConfig({}))
            .toThrow(/#11290/);
    });
});

test.describe('archivePath — runtime config field consumption (#11290 GPT Cycle 1 RA)', () => {
    const archiveRoot = path.join('resources', 'content', 'archive');

    test('honors archiveChunkThreshold override (non-default 50 → chunks at 100 items)', () => {
        const result = archivePath({
            archiveRoot,
            archiveChunkThreshold: 50,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-99.md',
            itemCount: 100,
            itemIndex: 99
        });

        expect(result).toContain(`${path.sep}chunk-2${path.sep}`);
    });

    test('honors archiveChunkThreshold override (non-default 200 → flat at 150 items)', () => {
        const result = archivePath({
            archiveRoot,
            archiveChunkThreshold: 200,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-100.md',
            itemCount: 150,
            itemIndex: 99
        });

        expect(result).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'issue-100.md'));
    });

    test('honors archiveChunkPrefix override', () => {
        const result = archivePath({
            archiveRoot,
            archiveChunkPrefix: 'bucket-',
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-100.md',
            itemCount: 101,
            itemIndex: 100
        });

        expect(result).toContain(`${path.sep}bucket-2${path.sep}`);
    });

    test('archiveChunkThreshold takes precedence over legacy maxItemsPerDir', () => {
        const result = archivePath({
            archiveRoot,
            archiveChunkThreshold: 25,
            maxItemsPerDir       : 100,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-26.md',
            itemCount: 30,
            itemIndex: 25
        });

        expect(result).toContain(`${path.sep}chunk-2${path.sep}`);
    });

    test('falls back to DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR when neither threshold field provided', () => {
        const result = archivePath({
            archiveRoot,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-100.md',
            itemCount: 100,
            itemIndex: 99
        });

        expect(result).toBe(path.join(archiveRoot, 'issues', 'v13.0.0', 'issue-100.md'));
    });

    test('falls back to DEFAULT_ARCHIVE_CHUNK_PREFIX when archiveChunkPrefix not provided', () => {
        const result = archivePath({
            archiveRoot,
            archiveChunkThreshold: 50,
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-99.md',
            itemCount: 100,
            itemIndex: 99
        });

        expect(result).toContain(`${path.sep}chunk-2${path.sep}`);
    });

    test('rejects invalid archiveChunkPrefix containing path separator', () => {
        expect(() => archivePath({
            archiveRoot,
            archiveChunkPrefix: 'bad/prefix',
            type     : 'issues',
            version  : 'v13.0.0',
            filename : 'issue-100.md',
            itemCount: 101,
            itemIndex: 100
        })).toThrow(/archiveChunkPrefix/);
    });
});
