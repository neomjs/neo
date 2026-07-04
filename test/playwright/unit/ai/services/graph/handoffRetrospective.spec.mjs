import {setup} from '../../../../setup.mjs';

const appName = 'HandoffRetrospectiveTest';

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

test.describe('handoffRetrospective — the history leg of the overview asymmetry', () => {
    let mod;

    const declaredStats = (overrides = {}) => ({
        filterSets: ['non-chore', 'agent-authored'],
        counts    : {mergedPrs: 4, openedPrs: 2, closedIssues: 3, openedIssues: 5, graduations: 1, sessions: 6},
        topEvents : [
            {ref: 'PR #14596', headline: 'GP zero-routes fix merged', at: '2026-07-04T03:57:39Z'},
            {ref: '#14565',    headline: 'direction-weighted GP epic filed'}
        ],
        ...overrides
    });

    test.beforeAll(async () => {
        mod = await import('../../../../../../ai/services/graph/handoffRetrospective.mjs');
    });

    test('grain selection is staleness-adaptive with explicit override winning', () => {
        const {selectRetrospectiveGrain, RETROSPECTIVE_GRAINS} = mod;

        // staleness boundaries: fresh reader → daily; ~2 days → 3-day (the ticket's worked example); long-away → weekly
        expect(selectRetrospectiveGrain({hoursSinceLastSeen: 5}).id).toBe('daily');
        expect(selectRetrospectiveGrain({hoursSinceLastSeen: 48}).id).toBe('3-day');
        expect(selectRetrospectiveGrain({hoursSinceLastSeen: 200}).id).toBe('weekly');

        // explicit valid override always wins; invalid override falls back to staleness — never throws
        expect(selectRetrospectiveGrain({hoursSinceLastSeen: 5, override: 'weekly'}).id).toBe('weekly');
        expect(selectRetrospectiveGrain({hoursSinceLastSeen: 5, override: 'hourly'}).id).toBe('daily');
        expect(selectRetrospectiveGrain()).toBe(RETROSPECTIVE_GRAINS.DAILY);
    });

    test('every rendered count carries its declared filter set; undeclared filters withhold counts', () => {
        const declared = mod.renderHandoffRetrospectiveSection({stats: declaredStats()});

        // every count line renders under the declared filter set — a naked number never appears
        for (const label of ['Merged PRs: 4', 'Opened PRs: 2', 'Closed issues: 3', 'Opened issues: 5', 'Graduations: 1', 'Sessions: 6']) {
            expect(declared).toContain(`- ${label} \`[filters: non-chore + agent-authored]\``);
        }

        // the falsifier-symmetry rule: no declared filter set → counts withheld, honestly
        const withheld = mod.renderHandoffRetrospectiveSection({stats: {counts: {mergedPrs: 99}}});

        expect(withheld).toContain('Counts withheld');
        expect(withheld).not.toContain('99');
    });

    test('density is bounded: top events cap with an explicit overflow line', () => {
        const events  = Array.from({length: 12}, (_, i) => ({ref: `#${i + 1}`, headline: `event ${i + 1}`}));
        const section = mod.renderHandoffRetrospectiveSection({stats: declaredStats({topEvents: events})});

        expect(section).toContain('#7 — event 7');
        expect(section).not.toContain('#8 — event 8');
        expect(section).toContain('+ 5 more in this window');
    });

    test('quiet windows and routing-firewall semantics render honestly', () => {
        const {RETROSPECTIVE_GRAINS} = mod;

        // zero activity = a bounded empty diagnostic, distinguishable from a missing section
        const quiet = mod.renderHandoffRetrospectiveSection({
            grain: RETROSPECTIVE_GRAINS.THREE_DAY,
            stats: {filterSets: 'non-chore', counts: {}, topEvents: []}
        });

        expect(quiet).toContain('Quiet window');
        expect(quiet).toContain('72h');
        expect(quiet).toContain('[filters: non-chore]');

        // the firewall line: history never renders as routing, and no numbered route entries exist
        const section = mod.renderHandoffRetrospectiveSection({stats: declaredStats()});

        expect(section).toContain('no numbered immediate recommendation');
        expect(section).not.toMatch(/\*\*issue-\d+\*\*:/);

        // render never throws on garbage input
        expect(() => mod.renderHandoffRetrospectiveSection({grain: null, stats: null, capturedAt: 'nonsense'})).not.toThrow();
        expect(() => mod.renderHandoffRetrospectiveSection()).not.toThrow();
    });
});
