import {test, expect}       from '@playwright/test';
import fs                   from 'fs-extra';
import os                   from 'os';
import path                 from 'path';
import createDiscussionIndex from '../../../../../../../buildScripts/docs/index/discussions.mjs';
import createPullRequestIndex from '../../../../../../../buildScripts/docs/index/pulls.mjs';

/**
 * @summary Verifies the Portal index generators: the PR generator emits a flat tree (group roots +
 * leaves carrying their markdown path, matching tickets.json); the Discussion generator emits the
 * chunked root-plus-leaves contract.
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

test.describe('Portal content index generators (#12210)', () => {
    let tempDir;

    test.beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-content-index-'))
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('createPullRequestIndex emits a flat tree of group roots + PR leaves (matching tickets.json)', async () => {
        const
            inputDir   = path.join(tempDir, 'resources/content/pulls'),
            archiveDir = path.join(tempDir, 'resources/content/archive/pulls'),
            outputFile = path.join(tempDir, 'apps/portal/resources/data/pulls.json'),
            outputDir  = path.join(tempDir, 'apps/portal/resources/data/pulls');

        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-4.md'), frontmatter({
            number   : 4,
            title    : 'Merged active PR',
            state    : 'MERGED',
            mergedAt : '2026-05-04T00:00:00Z',
            updatedAt: '2026-05-04T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-2.md'), frontmatter({
            number   : 2,
            title    : 'Open active PR',
            state    : 'OPEN',
            updatedAt: '2026-05-02T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/pr-3.md'), frontmatter({
            number   : 3,
            title    : 'Closed active PR',
            state    : 'CLOSED',
            closedAt : '2026-05-03T00:00:00Z',
            updatedAt: '2026-05-03T00:00:00Z'
        }));
        await fs.outputFile(path.join(archiveDir, 'v12.1.0/chunk-1/pr-1.md'), frontmatter({
            number   : 1,
            title    : 'Merged archived PR',
            state    : 'MERGED',
            mergedAt : '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-01T00:00:00Z'
        }));

        await createPullRequestIndex({archiveDir, inputDir, outputDir, outputFile});

        const root = await fs.readJson(outputFile);

        // Flat tree (mirrors tickets.json): group roots + PR leaves directly beneath, sorted by
        // date desc then number desc within each group. No chunk-folder indirection.
        expect(root.map(record => record.id)).toEqual([
            'Merged', '4', '1',
            'Open', '2',
            'Closed', '3'
        ]);

        expect(root.find(record => record.id === 'Merged')).toEqual({
            collapsed: false, id: 'Merged', isLeaf: false, parentId: null
        });
        expect(root.find(record => record.id === 'Open')).toEqual({
            collapsed: true, id: 'Open', isLeaf: false, parentId: null
        });

        // PR leaves carry their own markdown `path` (the flat content contract).
        expect(root.find(record => record.id === '4')).toEqual({
            id      : '4',
            parentId: 'Merged',
            path    : path.relative(process.cwd(), path.join(inputDir, 'chunk-1/pr-4.md')),
            title   : 'Merged active PR'
        });
        expect(root.find(record => record.id === '1')).toEqual({
            id      : '1',
            parentId: 'Merged',
            path    : path.relative(process.cwd(), path.join(archiveDir, 'v12.1.0/chunk-1/pr-1.md')),
            title   : 'Merged archived PR'
        });

        // Flat contract: no chunk-folder nodes and no per-chunk leaf directory.
        expect(root.some(record => record.childrenUrl)).toBe(false);
        expect(await fs.pathExists(outputDir)).toBe(false)
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
            updatedAt: '2026-05-10T00:00:00Z'
        }));
        await fs.outputFile(path.join(inputDir, 'chunk-1/discussion-12.md'), frontmatter({
            number   : 12,
            title    : 'Active fallback category',
            updatedAt: '2026-05-12T00:00:00Z'
        }));
        await fs.outputFile(path.join(archiveDir, 'v8.30.0/chunk-1/discussion-11.md'), frontmatter({
            number   : 11,
            title    : 'Archived answer',
            category : 'Q&A',
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
            title   : 'Archived answer'
        }])
    })
});
