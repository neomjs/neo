import {test, expect}       from '@playwright/test';
import fs                   from 'fs-extra';
import os                   from 'os';
import path                 from 'path';
import createDiscussionIndex from '../../../../../../../buildScripts/docs/index/discussions.mjs';
import createPullRequestIndex from '../../../../../../../buildScripts/docs/index/pulls.mjs';

/**
 * @summary Verifies the Portal index generators: the PR generator emits the chunked
 * root-plus-leaves contract (release-grouped); the Discussion generator emits the
 * category-grouped chunked contract.
 */

function frontmatter(data) {
    return [
        '---',
        ...Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
        '---',
        '',
        '# Body'
    ].join('\n')
}

/**
 * @param {Object} record
 * @returns {Number|null}
 */
function getChunkNumber(record) {
    const match = record.title?.match(/chunk-(\d+)$/);

    return match ? Number(match[1]) : null
}

/**
 * @param {Object[]} records
 * @param {String} parentId
 */
function expectChunkFoldersDescending(records, parentId) {
    const chunkNumbers = records
        .filter(record => record.parentId === parentId && getChunkNumber(record) !== null)
        .map(getChunkNumber);

    expect(chunkNumbers.length).toBeGreaterThan(1);
    expect(chunkNumbers).toEqual([...chunkNumbers].sort((a, b) => b - a))
}

test.describe('Portal content index generators (#12210)', () => {
    let tempDir;

    test.beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-content-index-'))
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('createPullRequestIndex emits a release-grouped chunked lazy surface (mirrors tickets)', async () => {
        const
            inputDir          = path.join(tempDir, 'resources/content/pulls'),
            archiveDir        = path.join(tempDir, 'resources/content/archive/pulls'),
            dataDir           = path.join(tempDir, 'apps/portal/resources/data'),
            outputDir         = path.join(dataDir, 'pulls'),
            chunkedOutputFile = path.join(dataDir, 'pulls/index.json'),
            manifestFile      = path.join(dataDir, 'pulls/manifest.json');

        // Active (unreleased) PRs → the `Latest` group. State (MERGED/OPEN/CLOSED) does NOT drive grouping.
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-4.md'), frontmatter({
            number   : 4,
            title    : 'Unreleased merged PR',
            state    : 'MERGED',
            mergedAt : '2026-05-04T00:00:00Z',
            updatedAt: '2026-05-04T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-2.md'), frontmatter({
            number   : 2,
            title    : 'Unreleased open PR',
            state    : 'OPEN',
            updatedAt: '2026-05-02T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-3.md'), frontmatter({
            number   : 3,
            title    : 'Unreleased closed PR',
            state    : 'CLOSED',
            closedAt : '2026-05-03T00:00:00Z',
            updatedAt: '2026-05-03T00:00:00Z'
        }));
        // Archived (released) PR → the `v12.1.0` release group.
        await fs.outputFile(path.join(archiveDir, 'v12.1.0/chunk-1/pr-1.md'), frontmatter({
            number   : 1,
            title    : 'Released PR',
            state    : 'MERGED',
            mergedAt : '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-01T00:00:00Z'
        }));

        await createPullRequestIndex({archiveDir, dataDir, inputDir, outputDir, chunkedOutputFile, manifestFile});

        // 1. Chunked lazy surface: group roots (`Latest` first, then versions desc — grouping is by
        //    RELEASE, not PR state) + chunk nodes carrying reconstruction metadata
        //    (`contentDir` + `filePrefix`); chunk leaves omit the repeated `path`.
        const index = await fs.readJson(chunkedOutputFile);

        expect(index.find(record => record.id === 'Latest')).toEqual({
            collapsed: true, id: 'Latest', isLeaf: false, parentId: null
        });
        expect(index.find(record => record.id === 'v12.1.0')).toEqual({
            collapsed: false, id: 'v12.1.0', isLeaf: false, parentId: null
        });
        expect(index.find(record => record.id === 'Latest/active-chunk-1')).toMatchObject({
            childCount : 3,
            childrenUrl: 'pulls/latest/active-chunk-1.json',
            contentDir : path.relative(process.cwd(), path.join(inputDir, 'chunk-1')),
            filePrefix : 'pr-',
            isLeaf     : false,
            parentId   : 'Latest'
        });

        await expect(fs.readJson(path.join(outputDir, 'latest/active-chunk-1.json'))).resolves.toEqual([
            {id: '4', parentId: 'Latest/active-chunk-1', title: 'Unreleased merged PR'},
            {id: '3', parentId: 'Latest/active-chunk-1', title: 'Unreleased closed PR'},
            {id: '2', parentId: 'Latest/active-chunk-1', title: 'Unreleased open PR'}
        ]);

        // 2. Crawler manifest enumerates the chunk leaf files.
        const manifest = await fs.readJson(manifestFile);

        expect(manifest.indexUrl).toBe('pulls/index.json');
        expect(manifest.chunks.some(chunk => chunk.childrenUrl === 'pulls/latest/active-chunk-1.json')).toBe(true);

        // 3. The deep-link id map names each leaf's chunk folder — active and archived alike.
        await expect(fs.readJson(path.join(outputDir, 'idMap.json'))).resolves.toEqual({
            '1': 'v12.1.0/archive-v12-1-0-chunk-1',
            '2': 'Latest/active-chunk-1',
            '3': 'Latest/active-chunk-1',
            '4': 'Latest/active-chunk-1'
        })
    });

    test('createPullRequestIndex orders chunk folders by chunk-number (desc), not by sortDate, matching the positional labels (#12309)', async () => {
        const
            inputDir          = path.join(tempDir, 'resources/content/pulls'),
            archiveDir        = path.join(tempDir, 'resources/content/archive/pulls'),
            dataDir           = path.join(tempDir, 'apps/portal/resources/data'),
            outputDir         = path.join(dataDir, 'pulls'),
            chunkedOutputFile = path.join(dataDir, 'pulls/index.json'),
            manifestFile      = path.join(dataDir, 'pulls/manifest.json');

        // Same Latest group, three chunk folders, NON-MONOTONIC dates: a sortDate ordering would emit
        // [chunk-1, chunk-3, chunk-2] — scrambled relative to the positional `treeNodeName` labels.
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-110.md'), frontmatter({
            number   : 110,
            title    : 'Newest date, lowest chunk',
            state    : 'OPEN',
            updatedAt: '2026-05-30T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-2/pr-210.md'), frontmatter({
            number   : 210,
            title    : 'Oldest date, middle chunk',
            state    : 'OPEN',
            updatedAt: '2026-05-01T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-3/pr-310.md'), frontmatter({
            number   : 310,
            title    : 'Middle date, highest chunk',
            state    : 'OPEN',
            updatedAt: '2026-05-15T00:00:00Z'
        }));

        await createPullRequestIndex({archiveDir, dataDir, inputDir, outputDir, chunkedOutputFile, manifestFile});

        // Chunk folders descend by chunk-number (newest/highest chunk first), regardless of sortDate.
        const index = await fs.readJson(chunkedOutputFile);

        expect(index.map(record => record.id)).toEqual([
            'Latest',
            'Latest/active-chunk-3',
            'Latest/active-chunk-2',
            'Latest/active-chunk-1'
        ])
    });

    test('committed pull-request index keeps active chunk folders in chunk-number order', async () => {
        const index = await fs.readJson(path.join(process.cwd(), 'apps/portal/resources/data/pulls/index.json'));

        expectChunkFoldersDescending(index, 'Latest')
    });

    test('createDiscussionIndex groups by frontmatter category for active and archive files', async () => {
        const
            inputDir   = path.join(tempDir, 'resources/content/discussions'),
            archiveDir = path.join(tempDir, 'resources/content/archive/discussions'),
            outputFile = path.join(tempDir, 'apps/portal/resources/data/discussions.json'),
            outputDir  = path.join(tempDir, 'apps/portal/resources/data/discussions');

        await fs.outputFile(path.join(inputDir, 'chunk-1/discussion-10.md'), frontmatter({
            number   : 10,
            title    : 'Active idea',
            category : 'Ideas',
            closed   : false,
            updatedAt: '2026-05-10T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/discussion-12.md'), frontmatter({
            number   : 12,
            title    : 'Active fallback category',
            closed   : false,
            updatedAt: '2026-05-12T00:00:00Z'
        }));
        await fs.outputFile(path.join(archiveDir, 'v8.30.0/chunk-1/discussion-11.md'), frontmatter({
            number   : 11,
            title    : 'Archived answer',
            category : 'Q&A',
            closed   : true,
            updatedAt: '2026-05-11T00:00:00Z'
        }));

        await createDiscussionIndex({archiveDir, inputDir, outputDir, outputFile});

        const root = await fs.readJson(outputFile);

        expect(root.map(record => record.id)).toEqual([
            'Ideas',
            'Ideas/active-chunk-1',
            'General',
            'General/active-chunk-1',
            'Q&A',
            'Q&A/archive-v8-30-0-chunk-1'
        ]);

        expect(root.find(record => record.id === 'Q&A/archive-v8-30-0-chunk-1')).toMatchObject({
            childrenUrl: 'discussions/q-a/archive-v8-30-0-chunk-1.json',
            childCount : 1,
            contentDir : path.relative(process.cwd(), path.join(archiveDir, 'v8.30.0/chunk-1')),
            filePrefix : 'discussion-',
            isLeaf     : false,
            parentId   : 'Q&A'
        });

        await expect(fs.readJson(path.join(outputDir, 'q-a/archive-v8-30-0-chunk-1.json'))).resolves.toEqual([{
            id      : '11',
            parentId: 'Q&A/archive-v8-30-0-chunk-1',
            state   : 'closed',
            title   : 'Archived answer'
        }]);

        // The deep-link id map spans categories and archive buckets alike.
        await expect(fs.readJson(path.join(outputDir, 'idMap.json'))).resolves.toEqual({
            '10': 'Ideas/active-chunk-1',
            '11': 'Q&A/archive-v8-30-0-chunk-1',
            '12': 'General/active-chunk-1'
        })
    })
});
