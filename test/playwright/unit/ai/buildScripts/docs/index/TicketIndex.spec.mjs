import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';
import createTicketIndex from '../../../../../../../buildScripts/docs/index/tickets.mjs';

/**
 * @summary Verifies the Portal ticket index generator emits the chunked
 * root-plus-leaves contract (root index, path-free leaf files, crawler manifest).
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

test.describe('Portal ticket index generator (#12217)', () => {
    let tempDir;

    test.beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-ticket-index-'))
    });

    test.afterEach(async () => {
        await fs.remove(tempDir)
    });

    test('emits the chunked path-free leaves, root index and manifest', async () => {
        const
            issuesDir         = path.join(tempDir, 'resources/content/issues'),
            archiveDir        = path.join(tempDir, 'resources/content/archive/issues'),
            dataDir           = path.join(tempDir, 'apps/portal/resources/data'),
            outputDir         = path.join(dataDir, 'tickets'),
            chunkedOutputFile = path.join(outputDir, 'index.json'),
            manifestFile      = path.join(outputDir, 'manifest.json');

        await fs.outputFile(path.join(issuesDir, 'chunk-2/issue-30.md'), frontmatter({
            id       : 30,
            title    : 'Active enhancement',
            labels   : ['enhancement'],
            updatedAt: '2026-05-30T00:00:00Z'
        }));

        await fs.outputFile(path.join(issuesDir, 'chunk-1/issue-10.md'), frontmatter({
            id       : 10,
            title    : 'Excluded chore',
            labels   : ['chore'],
            updatedAt: '2026-05-10T00:00:00Z'
        }));

        await fs.outputFile(path.join(archiveDir, 'v12.1.0/chunk-1/issue-20.md'), frontmatter({
            id      : 20,
            title   : 'Archived bug',
            labels  : ['bug'],
            closedAt: '2026-05-20T00:00:00Z'
        }));

        await fs.outputFile(path.join(archiveDir, 'v11.0.0/chunk-1/issue-5.md'), frontmatter({
            id      : 5,
            title   : 'Older docs ticket',
            labels  : ['documentation'],
            closedAt: '2025-11-05T00:00:00Z'
        }));

        await createTicketIndex({archiveDir, chunkedOutputFile, dataDir, issuesDir, manifestFile, outputDir});

        const root = await fs.readJson(chunkedOutputFile);

        expect(root.map(record => record.id)).toEqual([
            'Backlog',
            'Backlog/active-chunk-2',
            'v12.1.0',
            'v12.1.0/archive-v12-1-0-chunk-1',
            'v11.0.0',
            'v11.0.0/archive-v11-0-0-chunk-1'
        ]);
        expect(root.find(record => record.id === 'Backlog/active-chunk-2')).toMatchObject({
            childrenUrl: 'tickets/backlog/active-chunk-2.json',
            childCount : 1,
            contentDir : path.relative(process.cwd(), path.join(issuesDir, 'chunk-2')),
            filePrefix : 'issue-',
            isLeaf     : false,
            parentId   : 'Backlog',
            title      : 'chunk-2'
        });

        await expect(fs.readJson(path.join(outputDir, 'backlog/active-chunk-2.json'))).resolves.toEqual([{
            id      : '30',
            parentId: 'Backlog/active-chunk-2',
            title   : 'Active enhancement'
        }]);

        const archiveChunk = await fs.readJson(path.join(outputDir, 'v12-1-0/archive-v12-1-0-chunk-1.json'));

        expect(archiveChunk).toEqual([{
            id      : '20',
            parentId: 'v12.1.0/archive-v12-1-0-chunk-1',
            title   : 'Archived bug'
        }]);
        expect(archiveChunk[0]).not.toHaveProperty('path');

        await expect(fs.readJson(manifestFile)).resolves.toMatchObject({
            indexUrl: 'tickets/index.json',
            chunks  : expect.arrayContaining([expect.objectContaining({
                id         : 'Backlog/active-chunk-2',
                childrenUrl: 'tickets/backlog/active-chunk-2.json',
                childCount : 1
            })])
        });

        // The deep-link id map names each leaf's chunk folder — and only included leaves:
        // the excluded chore (id 10) must not appear.
        await expect(fs.readJson(path.join(outputDir, 'idMap.json'))).resolves.toEqual({
            '5' : 'v11.0.0/archive-v11-0-0-chunk-1',
            '20': 'v12.1.0/archive-v12-1-0-chunk-1',
            '30': 'Backlog/active-chunk-2'
        })
    });

    test('orders chunk folders by chunk-number (desc), not by sortDate, matching the positional labels (#12309)', async () => {
        const
            issuesDir         = path.join(tempDir, 'resources/content/issues'),
            archiveDir        = path.join(tempDir, 'resources/content/archive/issues'),
            dataDir           = path.join(tempDir, 'apps/portal/resources/data'),
            outputDir         = path.join(dataDir, 'tickets'),
            chunkedOutputFile = path.join(outputDir, 'index.json'),
            manifestFile      = path.join(outputDir, 'manifest.json');

        // Three chunk folders in the SAME (Backlog) group with NON-MONOTONIC dates: the lowest-numbered
        // chunk carries the newest date, the highest-numbered the middle date. A sortDate ordering would
        // emit [chunk-1, chunk-3, chunk-2] — scrambled relative to the positional `treeNodeName` labels.
        await fs.outputFile(path.join(issuesDir, 'chunk-1/issue-110.md'), frontmatter({
            id       : 110,
            title    : 'Newest date, lowest chunk',
            labels   : ['enhancement'],
            updatedAt: '2026-05-30T00:00:00Z'
        }));
        await fs.outputFile(path.join(issuesDir, 'chunk-2/issue-210.md'), frontmatter({
            id       : 210,
            title    : 'Oldest date, middle chunk',
            labels   : ['enhancement'],
            updatedAt: '2026-05-01T00:00:00Z'
        }));
        await fs.outputFile(path.join(issuesDir, 'chunk-3/issue-310.md'), frontmatter({
            id       : 310,
            title    : 'Middle date, highest chunk',
            labels   : ['enhancement'],
            updatedAt: '2026-05-15T00:00:00Z'
        }));

        await createTicketIndex({archiveDir, chunkedOutputFile, dataDir, issuesDir, manifestFile, outputDir});

        // Chunk folders descend by chunk-number (newest/highest chunk first), regardless of sortDate.
        const root = await fs.readJson(chunkedOutputFile);

        expect(root.map(record => record.id)).toEqual([
            'Backlog',
            'Backlog/active-chunk-3',
            'Backlog/active-chunk-2',
            'Backlog/active-chunk-1'
        ])
    });

    test('committed ticket index keeps active chunk folders in chunk-number order', async () => {
        const root = await fs.readJson(path.join(process.cwd(), 'apps/portal/resources/data/tickets/index.json'));

        expectChunkFoldersDescending(root, 'Backlog')
    })
});
