import {setup} from '../../../setup.mjs';

const appName = 'DirectionVelocityTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('directionVelocity — {v_D, s_D, r_D} composed FROM breakdowns, owner-disposition semantics', () => {
    let velocity;

    // two windows under mapping v3: the engine direction has high MOTION and high STALL-MASS
    // simultaneously — the "fast-but-bleeding" case the separability contract exists for
    const W1 = {
        windowId       : 'w-2026-06-a',
        since          : '2026-06-01T00:00:00Z',
        until          : '2026-06-08T00:00:00Z',
        motionBreakdown: {'evolution-goal-engine@3': 0.6, 'evolution-goal-design@3': 0.3, unattributed: 0.1},
        motionCount    : 100,
        stallBreakdown : {'evolution-goal-engine@3': 0.8, unattributed: 0.2},
        stallCount     : 10
    };
    const W2 = {
        windowId       : 'w-2026-06-b',
        since          : '2026-06-08T00:00:00Z',
        until          : '2026-06-15T00:00:00Z',
        motionBreakdown: {'evolution-goal-engine@3': 0.8, 'evolution-goal-design@3': 0.05, unattributed: 0.15},
        motionCount    : 200,
        stallBreakdown : {'evolution-goal-engine@3': 1.0, unattributed: 0},
        stallCount     : 30
    };

    test.beforeAll(async () => {
        velocity = await import('../../../../../ai/graph/directionVelocity.mjs');
    });

    test('v_D and s_D are SEPARABLE absolute measures — fast-but-bleeding stays visible', () => {
        const {valid, rows, mappingVersion} = velocity.composeVelocity({windows: [W1, W2], filterSet: 'non-chore'});

        expect(valid).toBe(true);
        expect(mappingVersion).toBe(3);

        const engine = rows.find(row => row.directionKey === 'evolution-goal-engine@3');

        // v_D = 0.6×100 + 0.8×200 = 220 · s_D = 0.8×10 + 1.0×30 = 38 — both large, both visible
        expect(engine.v_D).toBeCloseTo(220);
        expect(engine.s_D).toBeCloseTo(38);
        // and the per-window columns never mix the two classes
        expect(engine.perWindow[0].v).toBeCloseTo(60);
        expect(engine.perWindow[0].s).toBeCloseTo(8);
    });

    test('r_D is attribution FLOW (share delta), null under 2 windows, sign-correct both ways', () => {
        const twoWindows = velocity.composeVelocity({windows: [W1, W2], filterSet: 'non-chore'}).rows;

        // engine share rose 0.6 → 0.8; design collapsed 0.3 → 0.05 (the June shape in miniature)
        expect(twoWindows.find(r => r.directionKey === 'evolution-goal-engine@3').r_D).toBeCloseTo(0.2);
        expect(twoWindows.find(r => r.directionKey === 'evolution-goal-design@3').r_D).toBeCloseTo(-0.25);

        const oneWindow = velocity.composeVelocity({windows: [W1], filterSet: 'non-chore'}).rows;
        expect(oneWindow.find(r => r.directionKey === 'evolution-goal-engine@3').r_D).toBeNull();
    });

    test('every row carries its pins + a falsifying query with the SAME filters and version', () => {
        const {rows, filterSet} = velocity.composeVelocity({windows: [W1, W2], filterSet: 'non-chore'});

        for (const row of rows) {
            expect(row.mappingVersion).toBe(3);
            expect(row.filterSet).toBe('non-chore');
            expect(row.falsifyingQuery).toContain('[non-chore]');
            expect(row.falsifyingQuery).toContain('mapping v3');
            expect(row.falsifyingQuery).toContain(row.directionKey);
        }

        // and composition without a declared filter set refuses — an unpinned number never exists
        expect(velocity.composeVelocity({windows: [W1]}).valid).toBe(false);
    });

    test('contract-level refusals: conservation breach, mixed versions, unparseable windows', () => {
        const broken = {...W1, motionBreakdown: {'evolution-goal-engine@3': 0.9, unattributed: 0.3}}; // sums 1.2
        expect(velocity.composeVelocity({windows: [broken], filterSet: 'x'}).reason).toContain('conservation');

        const mixed = {...W2, motionBreakdown: {'evolution-goal-engine@4': 0.9, unattributed: 0.1}};
        expect(velocity.composeVelocity({windows: [W1, mixed], filterSet: 'x'}).reason).toContain('mixed mapping versions');

        const garbage = {...W1, since: 'not-a-date'};
        expect(velocity.composeVelocity({windows: [garbage], filterSet: 'x'}).reason).toContain('unparseable');
    });

    test('the cardinality probe: inline under the threshold, side-table above, conservative on unmeasurable', () => {
        expect(velocity.probeBreakdownCardinality({recordBytes: 1000, breakdownBytes: 100}).disposition).toBe('inline');
        expect(velocity.probeBreakdownCardinality({recordBytes: 1000, breakdownBytes: 300}).disposition).toBe('side-table');
        expect(velocity.probeBreakdownCardinality({recordBytes: 0, breakdownBytes: 10}).disposition).toBe('side-table');
        expect(velocity.probeBreakdownCardinality({}).disposition).toBe('side-table');
    });
});
