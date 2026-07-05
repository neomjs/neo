import {setup} from '../../../setup.mjs';

const appName = 'DirectionHindcastReplayTest';

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

test.describe('directionHindcastReplay — only-in-W by construction, the June gate, the May lock', () => {
    let replay;

    test.beforeAll(async () => {
        replay = await import('../../../../../ai/graph/directionHindcastReplay.mjs');
    });

    test('THE JUNE GATE: the born-labeled fixture detects the starved design/UX direction — or the approach fails', () => {
        const {window, history, mappingVersion, filterSet} = replay.JUNE_2026_FIXTURE;
        const run                                          = replay.runHindcastWindow({window, history, mappingVersion, filterSet});

        // the anchor set at June start: both declared intents active; the post-window goal invisible
        expect(run.anchorSet.map(goal => goal.id).sort()).toEqual(['evolution-goal-design-ux', 'evolution-goal-engine-hardening']);

        // conservation holds on the replay
        expect(run.conservation.valid).toBe(true);

        // THE GATE: design/UX — declared, active, zero attributed motion — must read STARVED
        // (the INTENT_STARVED class, per the alignment contract's starved list)
        expect(run.alignment.starved).toContain('evolution-goal-design-ux');

        // and the engine direction, carrying the month's motion, must be ALIGNED — never starved
        expect(run.alignment.aligned).toContain('evolution-goal-engine-hardening');
        expect(run.alignment.starved).not.toContain('evolution-goal-engine-hardening');

        // the unattributed tail is visible, never faked into a direction
        expect(run.alignment.unattributedShare).toBeGreaterThan(0);
    });

    test('NO FUTURE LEAKAGE, by construction: post-window events and goals cannot alter the run', () => {
        const {window, history, mappingVersion, filterSet} = replay.JUNE_2026_FIXTURE;

        // baseline: the fixture ALREADY contains July motion + a July goal — strip them for the control
        const strippedHistory = {
            declaredGoals: history.declaredGoals.filter(goal => Date.parse(goal.declaredAt) < Date.parse(window.until)),
            motionEvents : history.motionEvents.filter(event => Date.parse(event.at) < Date.parse(window.until))
        };

        const withFuture    = replay.runHindcastWindow({window, history, mappingVersion, filterSet});
        const withoutFuture = replay.runHindcastWindow({window, history: strippedHistory, mappingVersion, filterSet});

        // deep-equal outputs: the future was structurally invisible (the July design flood changed NOTHING)
        expect(JSON.stringify(withFuture.breakdown)).toBe(JSON.stringify(withoutFuture.breakdown));
        expect(JSON.stringify(withFuture.alignment)).toBe(JSON.stringify(withoutFuture.alignment));
        expect(withFuture.events.map(e => e.id)).toEqual(withoutFuture.events.map(e => e.id));
    });

    test('anchor reconstruction is as-of: future declarations invisible, mid-window retirements stay active for the window', () => {
        const goals = [
            {id: 'g-early',   matchers: ['c1'], declaredAt: '2026-05-01T00:00:00Z'},
            {id: 'g-retired', matchers: ['c2'], declaredAt: '2026-05-01T00:00:00Z', retiredAt: '2026-06-15T00:00:00Z'},
            {id: 'g-prior',   matchers: ['c3'], declaredAt: '2026-04-01T00:00:00Z', retiredAt: '2026-05-20T00:00:00Z'},
            {id: 'g-future',  matchers: ['c4'], declaredAt: '2026-07-05T00:00:00Z'}
        ];

        const atJuneStart = replay.reconstructAnchorSet(goals, '2026-06-01T00:00:00Z');
        const ids         = atJuneStart.map(goal => goal.id).sort();

        // g-retired retires MID-window → still active AT window start; g-prior retired before → gone; g-future → invisible
        expect(ids).toEqual(['g-early', 'g-retired']);
        expect(atJuneStart.every(goal => goal.lifecycle === 'active')).toBe(true);
    });

    test('THE MAY LOCK: the holdout door refuses everything but the recorded ceremony', () => {
        const {window, history, mappingVersion, filterSet} = replay.JUNE_2026_FIXTURE;

        expect(() => replay.runHoldout({window, history, mappingVersion, filterSet})).toThrow(/scored ONCE/);
        expect(() => replay.runHoldout({singleShot: false, operatorProvenance: 'x', window, history, mappingVersion, filterSet})).toThrow(/ceremony/);
        expect(() => replay.runHoldout({singleShot: true, operatorProvenance: '', window, history, mappingVersion, filterSet})).toThrow(/ceremony/);

        // and WITH the ceremony, the door opens onto the same pure replay (proven on June data —
        // the May data itself never enters this repository)
        const ceremonial = replay.runHoldout({singleShot: true, operatorProvenance: 'unit-proof: the adjudicated-protocol pointer goes here', window, history, mappingVersion, filterSet});
        expect(ceremonial.conservation.valid).toBe(true);
    });
});
