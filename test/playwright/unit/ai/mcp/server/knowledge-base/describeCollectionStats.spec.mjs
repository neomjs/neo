import {setup} from '../../../../../setup.mjs';

const appName = 'KBDescribeCollectionStatsTest';

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

import {test, expect}                         from '@playwright/test';
import Neo                                    from '../../../../../../../src/Neo.mjs';
import * as core                              from '../../../../../../../src/core/_export.mjs';
import {describeCollectionStats, STATS_LEVEL} from '../../../../../../../ai/mcp/server/knowledge-base/describeCollectionStats.mjs';

/**
 * The startup collection-stats render, witnessed.
 *
 * This decision replaced an instrument that rendered a six-day corpus outage as success: startup
 * printed a green "health check passed" followed by `- Knowledge Base: 0`, both at info level. The
 * count was never missing — it was framed as success.
 *
 * A replacement instrument with nothing proving it fires repeats that shape one layer up, so the
 * POSITIVE case is the control here: without asserting that a populated corpus still renders at
 * `info`, an "always warn" implementation would satisfy every other assertion in this file.
 */
test.describe('describeCollectionStats — the startup corpus render decision', () => {
    test('a populated corpus renders at info — the CONTROL that an always-warn version would fail', async () => {
        const {level, lines} = describeCollectionStats({exists: true, count: 61206});

        expect(level).toBe(STATS_LEVEL.info);
        expect(lines).toEqual(['   - Knowledge Base: 61206']);
    });

    test('an empty corpus WARNS and never renders under the success framing', async () => {
        const {level, lines} = describeCollectionStats({exists: true, count: 0});

        expect(level).toBe(STATS_LEVEL.warn);
        expect(lines.length).toBeGreaterThan(1);
        expect(lines[0]).toContain('0 documents');

        // The recreated-collection cause must be named, because "0" alone reads as "ingestion has not
        // run yet" — which is the wrong conclusion in exactly the incident this exists to surface.
        expect(lines.join(' ')).toContain('recreated by a migration');
        expect(lines.join(' ')).toContain('previous data root');
    });

    test('an unreadable count WARNS as unverified rather than passing as populated', async () => {
        for (const count of [undefined, null, NaN, '61206']) {
            const {level, lines} = describeCollectionStats({exists: true, count});

            expect(level, `count ${String(count)} must not render as success`).toBe(STATS_LEVEL.warn);
            expect(lines.join(' ')).toContain('unverified');
        }
    });

    test('the unreadable check precedes the zero check, so a non-number never reports as 0 documents', async () => {
        // Ordering is load-bearing: `NaN === 0` is false, but a string or object count would sort into
        // whichever branch runs first. An unreadable count must say "unverified", not "0 documents",
        // because the two carry different operator actions.
        const {lines} = describeCollectionStats({exists: true, count: NaN});

        expect(lines.join(' ')).not.toContain('0 documents');
    });

    test('a missing collection is info, and no descriptor at all is silent with no lines', async () => {
        const absent = describeCollectionStats({exists: false});

        expect(absent.level).toBe(STATS_LEVEL.info);
        expect(absent.lines).toEqual(['   - Knowledge Base: unavailable']);

        // `silent` is a distinct answer from "info with nothing to add": lines is empty exactly here,
        // so a caller forwarding lines emits nothing rather than an empty log entry.
        for (const nothing of [null, undefined]) {
            const result = describeCollectionStats(nothing);

            expect(result.level).toBe(STATS_LEVEL.silent);
            expect(result.lines).toEqual([]);
        }
    });

    test('levels are frozen, so a caller cannot mutate the token it compares against', async () => {
        expect(Object.isFrozen(STATS_LEVEL)).toBe(true);
    });
});
