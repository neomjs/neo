import {setup} from '../../../../setup.mjs';

const appName = 'HandoffRetrospectiveAssemblerTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('handoffRetrospectiveAssembler — the pure fold beneath the render', () => {
    let assemble, render, grains;

    const NOW      = '2026-07-04T12:00:00Z';
    const hoursAgo = h => new Date(Date.parse(NOW) - h * 3600 * 1000).toISOString();

    test.beforeAll(async () => {
        const asm = await import('../../../../../../ai/services/graph/handoffRetrospectiveAssembler.mjs');
        const rnd = await import('../../../../../../ai/services/graph/handoffRetrospective.mjs');
        assemble = asm.assembleRetrospectiveStats;
        render   = rnd.renderHandoffRetrospectiveSection;
        grains   = rnd.RETROSPECTIVE_GRAINS;
    });

    test('windows facts by the grain and counts survivors per class', () => {
        const facts = {
            mergedPrs   : [{ref: 'PR #1', headline: 'in',  at: hoursAgo(10)}, {ref: 'PR #2', headline: 'out', at: hoursAgo(50)}],
            openedPrs   : [{ref: 'PR #3', headline: 'in',  at: hoursAgo(5)}],
            closedIssues: [{ref: '#4', headline: 'in', at: hoursAgo(1)}, {ref: '#5', headline: 'in', at: hoursAgo(23)}],
            graduations : [{ref: '#6', headline: 'grad', at: hoursAgo(2)}],
            sessions    : [{ref: 's1', headline: 'sess', at: hoursAgo(200)}] // outside even a daily window
        };

        const daily = assemble({facts, grain: grains.DAILY, now: NOW, filterSets: 'non-chore'});

        // daily window = 24h: the 50h PR and 200h session fall out; everything else counts
        expect(daily.counts).toEqual({mergedPrs: 1, openedPrs: 1, closedIssues: 2, openedIssues: 0, graduations: 1, sessions: 0});
        expect(daily.filterSets).toEqual(['non-chore']);
        expect(daily.computedAt).toBe(new Date(NOW).toISOString()); // canonical ISO (…000Z)

        // widening to weekly pulls the 50h PR back in but the 200h session stays out (168h window)
        const weekly = assemble({facts, grain: grains.WEEKLY, now: NOW, filterSets: 'non-chore'});
        expect(weekly.counts.mergedPrs).toBe(2);
        expect(weekly.counts.sessions).toBe(0);
    });

    test('top events merge all classes and rank by recency, tagged by kind', () => {
        const facts = {
            mergedPrs   : [{ref: 'PR #9', headline: 'oldest', at: hoursAgo(20)}],
            graduations : [{ref: '#10', headline: 'newest', at: hoursAgo(1)}],
            closedIssues: [{ref: '#11', headline: 'middle', at: hoursAgo(10)}]
        };

        const stats = assemble({facts, grain: grains.DAILY, now: NOW, filterSets: 'non-chore'});

        expect(stats.topEvents.map(e => e.headline)).toEqual(['newest', 'middle', 'oldest']);
        expect(stats.topEvents.map(e => e.kind)).toEqual(['graduation', 'closed-issue', 'merged-pr']);
    });

    test('undateable and future events are excluded, never crashing the fold', () => {
        const facts = {
            mergedPrs: [
                {ref: 'PR #1', headline: 'no date'},
                {ref: 'PR #2', headline: 'bad date', at: 'not-a-date'},
                {ref: 'PR #3', headline: 'future',   at: hoursAgo(-5)}, // 5h AFTER now
                {ref: 'PR #4', headline: 'valid',    at: hoursAgo(3)}
            ]
        };

        const stats = assemble({facts, grain: grains.DAILY, now: NOW, filterSets: 'non-chore'});

        expect(stats.counts.mergedPrs).toBe(1);
        expect(stats.topEvents).toHaveLength(1);
        expect(stats.topEvents[0].headline).toBe('valid');
    });

    test('no filter set → empty filterSets → the render withholds (honesty round-trip)', () => {
        const facts = {mergedPrs: [{ref: 'PR #1', headline: 'x', at: hoursAgo(1)}]};

        const undeclared = assemble({facts, grain: grains.DAILY, now: NOW});
        expect(undeclared.filterSets).toEqual([]);

        // the assembler's output feeds the render directly: undeclared → withheld, not naked counts.
        // capturedAt is pinned so the render is deterministic — the default new Date() made this
        // clock-dependent (the header's Captured-at timestamp), the root of the intermittent red.
        const section = render({grain: grains.DAILY, stats: undeclared, capturedAt: NOW});
        expect(section).toContain('Counts withheld');
        // honesty contract: withholding renders NO naked count line and NO event ref. Assert those
        // shapes, not a bare '1' — a bare digit also matched the header timestamp, not just a leak.
        expect(section).not.toContain('Merged PRs:');
        expect(section).not.toContain('PR #1');
    });

    test('assembler output renders end-to-end through the real render module', () => {
        const facts = {
            mergedPrs  : [{ref: 'PR #14678', headline: 'keeper route merged', at: hoursAgo(2)}],
            graduations: [{ref: '#14565', headline: 'direction GP epic', at: hoursAgo(6)}]
        };

        const stats   = assemble({facts, grain: grains.THREE_DAY, now: NOW, filterSets: ['non-chore', 'agent-authored']});
        const section = render({grain: grains.THREE_DAY, stats, capturedAt: NOW});

        expect(section).toContain('Handoff Retrospective (3-Day');
        expect(section).toContain('- Merged PRs: 1 `[filters: non-chore + agent-authored]`');
        expect(section).toContain('PR #14678 — keeper route merged');
        expect(section).not.toMatch(/\*\*issue-\d+\*\*:/); // firewall holds on real assembled data
    });

    test('empty facts yield an all-zero contract the render turns into the quiet state', () => {
        const stats   = assemble({facts: {}, grain: grains.DAILY, now: NOW, filterSets: 'non-chore'});
        const section = render({grain: grains.DAILY, stats});

        expect(Object.values(stats.counts).every(c => c === 0)).toBe(true);
        expect(stats.topEvents).toHaveLength(0);
        expect(section).toContain('Quiet window');
    });
});
