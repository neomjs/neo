import {setup}                 from '../../../../setup.mjs';
import {test, expect}          from '@playwright/test';
import Neo                     from '../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../src/core/_export.mjs';
import {readSyncedPullRecords} from '../../../../../../ai/services/graph/issueFocusSections.mjs';
import fs                      from 'node:fs';
import os                      from 'node:os';
import path                    from 'node:path';

/**
 * @summary Contract of the synced-pulls reader — the fleet-activity PR/lane slot's data source. It
 * projects `resources/content/pulls/**\/pr-*.md` frontmatter + the `## Reviews` body section (per
 * CONTENT_GRAMMAR.md) into the records `getPrHumanGateState` / `createPrActivityEvents` consume
 * (structured `reviews` + derived `reviewDecision`), BOUNDS the candidate set before parsing, and
 * distinguishes three source states: valid-empty (`[]`), configured-unreadable (THROWS → the wiring
 * degrades), and omitted (the wiring's concern, never reaching this reader). Temp fixture, no Neo instance.
 */
test.describe('Neo.ai.services.graph.readSyncedPullRecords', () => {
    let dir;

    const writePull = (name, frontmatter, body = '## Summary\nx') => {
        fs.mkdirSync(path.join(dir, 'chunk-1'), {recursive: true});
        fs.writeFileSync(path.join(dir, 'chunk-1', name), ['---', ...frontmatter, '---', body].join('\n'));
    };

    test.beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synced-pulls-'));
    });

    test.afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    test('parses synced pull markdown into the PR records the activity builder consumes', () => {
        writePull('pr-14739.md', [
            'number: 14739',
            'title: feat(ai) retrospective enrichment',
            'author: neo-fable',
            'state: MERGED',
            "createdAt: '2026-07-04T10:07:34Z'",
            "mergedAt: '2026-07-04T13:42:26Z'",
            "url: 'https://github.com/neomjs/neo/pull/14739'"
        ], '## Summary\nthe enrichment family goes to five fact classes');

        const [pr, ...rest] = readSyncedPullRecords(dir);

        expect(rest).toHaveLength(0);
        expect(pr.number).toBe(14739);
        expect(pr.title).toContain('retrospective enrichment');
        expect(pr.author).toBe('neo-fable');
        expect(pr.state).toBe('MERGED');
        expect(pr.mergedAt).toBe('2026-07-04T13:42:26Z');
        expect(pr.url).toBe('https://github.com/neomjs/neo/pull/14739');
        expect(pr.body).toContain('the enrichment family');
        // no `## Reviews` section → honest-empty reviews + no decision (not a fabricated APPROVED)
        expect(pr.reviews).toEqual([]);
        expect(pr.reviewDecision).toBeNull();
        // the synced grammar carries no draft field → isDraft left unset, never fabricated as false
        expect('isDraft' in pr).toBe(false)
    });

    test('projects the `## Reviews` section into structured reviews + a CHANGES_REQUESTED decision', () => {
        writePull('pr-15399.md', [
            'number: 15399', 'title: feat(fleet) synced-pulls reader', 'author: neo-opus-ada', 'state: OPEN'
        ], [
            '## Description',
            'the reader',
            '## Reviews',
            '### `@neo-gpt` (CHANGES_REQUESTED) reviewed on 2026-07-18T04:58:53Z',
            'bounded source-contract repair',
            '### `@neo-opus-vega` (APPROVED) reviewed on 2026-07-17T02:00:00Z',
            'looks good',
            '## Commits',
            '- `abc` c (by x)'
        ].join('\n'));

        const [pr] = readSyncedPullRecords(dir);

        // the `## Reviews` entries become structured facts; `## Commits` after it is NOT scanned as a review
        expect(pr.reviews).toEqual([
            {author: '@neo-gpt',       state: 'CHANGES_REQUESTED', submittedAt: '2026-07-18T04:58:53Z'},
            {author: '@neo-opus-vega', state: 'APPROVED',          submittedAt: '2026-07-17T02:00:00Z'}
        ]);
        // latest-per-author, CHANGES_REQUESTED dominates → the consumer's human-gate reads not-approved
        expect(pr.reviewDecision).toBe('CHANGES_REQUESTED')
    });

    test('an APPROVED-only PR derives APPROVED; a later CR by the same author flips the decision', () => {
        writePull('pr-15400.md', ['number: 15400', 'title: t', 'author: a', 'state: OPEN'],
            ['## Reviews',
             '### `@rev` (APPROVED) reviewed on 2026-07-17T01:00:00Z',
             '### `@rev` (CHANGES_REQUESTED) reviewed on 2026-07-17T02:00:00Z'].join('\n'));

        expect(readSyncedPullRecords(dir)[0].reviewDecision).toBe('CHANGES_REQUESTED');

        // a purely-approved PR
        fs.rmSync(path.join(dir, 'chunk-1'), {recursive: true, force: true});
        writePull('pr-15401.md', ['number: 15401', 'title: t', 'author: a', 'state: OPEN'],
            ['## Reviews', '### `@rev` (APPROVED) reviewed on 2026-07-17T01:00:00Z'].join('\n'));

        expect(readSyncedPullRecords(dir)[0].reviewDecision).toBe('APPROVED')
    });

    test('a configured-but-unreadable directory THROWS (so the wiring degrades) — not a silent []', () => {
        // The AC-1 seam: an OMITTED pullsDir is the wiring's honest-empty concern and never reaches this
        // reader; a CONFIGURED directory that cannot be collected must propagate so the slot degrades,
        // rather than masquerading as valid-empty.
        expect(() => readSyncedPullRecords(path.join(dir, 'does-not-exist'))).toThrow()
    });

    test('a configured, readable, PR-less directory is the only [] — a stray non-PR file is skipped', () => {
        fs.writeFileSync(path.join(dir, '_index.md'), ['---', 'title: index', '---', 'not a pull request'].join('\n'));

        expect(readSyncedPullRecords(dir)).toEqual([])
    });

    test('bounds the candidate set BEFORE parsing — only the newest `limit` PRs are ever read', () => {
        for (const n of [1, 2, 3, 4, 5]) {
            writePull(`pr-${n}.md`, [`number: ${n}`, 'title: t', 'author: a', 'state: OPEN']);
        }

        const originalReadFileSync = fs.readFileSync,
              readMarkdownPaths    = [];

        fs.readFileSync = (filePath, ...args) => {
            if (typeof filePath === 'string' && filePath.includes(dir) && filePath.endsWith('.md')) {
                readMarkdownPaths.push(filePath);
            }
            return originalReadFileSync(filePath, ...args)
        };

        try {
            const records = readSyncedPullRecords(dir, {limit: 2});

            // only the two newest PRs (by number) are parsed, and ONLY two markdown files are ever read
            expect(records.map(pr => pr.number).sort((a, b) => b - a)).toEqual([5, 4]);
            expect(readMarkdownPaths).toHaveLength(2);
            expect(readMarkdownPaths.some(p => p.endsWith('pr-1.md'))).toBe(false)
        } finally {
            fs.readFileSync = originalReadFileSync
        }
    })
});
