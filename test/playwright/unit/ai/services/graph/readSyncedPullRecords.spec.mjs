import {setup}                 from '../../../../setup.mjs';
import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {readSyncedPullRecords} from '../../../../../../ai/services/graph/issueFocusSections.mjs';
import fs                      from 'node:fs';
import os                      from 'node:os';
import path                    from 'node:path';

/**
 * @summary Contract of the synced-pulls reader — the fleet-activity PR/lane slot's data source that
 * completes the composer's previously honest-empty PR slot. It parses
 * `resources/content/pulls/**\/pr-*.md` frontmatter + body into the records `createPrActivityEvents`
 * consumes, fail-softs to `[]` on an absent/unreadable tree (the slot stays honest-empty, never throws),
 * and skips stray non-PR markdown. Pure fs/frontmatter — a temp fixture, no Neo instance.
 */
test.describe('Neo.ai.services.graph.readSyncedPullRecords', () => {
    let dir;

    test.beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synced-pulls-'));
    });

    test.afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('parses synced pull markdown into the PR records the activity builder consumes', () => {
        fs.mkdirSync(path.join(dir, 'chunk-1'));
        fs.writeFileSync(path.join(dir, 'chunk-1', 'pr-14739.md'), [
            '---',
            'number: 14739',
            'title: feat(ai) retrospective enrichment',
            'author: neo-fable',
            'state: MERGED',
            "createdAt: '2026-07-04T10:07:34Z'",
            "updatedAt: '2026-07-04T13:42:31Z'",
            "mergedAt: '2026-07-04T13:42:26Z'",
            "url: 'https://github.com/neomjs/neo/pull/14739'",
            '---',
            '## Summary',
            'the enrichment family goes to five fact classes'
        ].join('\n'));

        const records = readSyncedPullRecords(dir);

        expect(records).toHaveLength(1);

        const [pr] = records;
        expect(pr.number).toBe(14739);
        expect(pr.title).toContain('retrospective enrichment');
        expect(pr.author).toBe('neo-fable');
        expect(pr.state).toBe('MERGED');
        expect(pr.mergedAt).toBe('2026-07-04T13:42:26Z');
        expect(pr.url).toBe('https://github.com/neomjs/neo/pull/14739');
        expect(pr.body).toContain('the enrichment family');
    });

    test('fail-soft: an absent directory yields [] — the slot stays honest-empty, never throws', () => {
        expect(readSyncedPullRecords(path.join(dir, 'does-not-exist'))).toEqual([]);
    });

    test('skips non-PR markdown (a frontmatter file with no number — a stray index/metadata file)', () => {
        fs.writeFileSync(path.join(dir, '_index.md'), ['---', 'title: index', '---', 'not a pull request'].join('\n'));

        expect(readSyncedPullRecords(dir)).toEqual([]);
    });
});
