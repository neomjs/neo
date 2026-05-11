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
    DEFAULT_ARCHIVE_MAX_ITEMS_PER_DIR
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
