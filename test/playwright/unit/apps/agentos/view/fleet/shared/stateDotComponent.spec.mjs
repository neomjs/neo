import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetStateDotTest';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

/**
 * The dot is a graphical indicator that carries session state. Unlabelled it reaches assistive tech as
 * decoration, so it must expose an accessible NAME (WCAG 4.1.2 / 1.1.1). That is deliberately NOT the
 * 1.4.1 fix: a name does nothing for a sighted operator who cannot separate the hues — that needs a
 * visible non-colour channel on the consuming surface, tracked separately.
 */
test.describe('Fleet cockpit StateDot — accessible name + closed-set resolvers', () => {
    let StateDot, stateLabel, stateClass, stateToken;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../apps/agentos/view/fleet/shared/StateDotComponent.mjs');

        StateDot   = mod.default;
        stateLabel = mod.stateLabel;
        stateClass = mod.stateClass;
        stateToken = mod.stateToken
    });

    test('stateLabel resolves canonical labels and degrades to LITERAL text, never to off', () => {
        expect(stateLabel('ok')).toBe('working');
        expect(stateLabel('limited')).toBe('rate-limited');
        expect(stateLabel('off')).toBe('benched / offline');
        // the transitional pair now has canonical labels too — they render while an intent is in flight
        expect(stateLabel('starting')).toBe('starting');
        expect(stateLabel('stopping')).toBe('stopping');
        // an unrecognized state must stay readable rather than silently reading as `off`
        expect(stateLabel('some-new-state')).toBe('some-new-state');
        expect(stateLabel(undefined)).toBe('unknown');
        // prototype-shaped keys resolve to their literal text, never an inherited prototype value
        expect(stateLabel('toString')).toBe('toString');
        expect(stateLabel('__proto__')).toBe('__proto__')
    });

    test('the dot exposes an accessible name for its state', () => {
        const dot = Neo.create(StateDot, {appName, state: 'wedged'});

        expect(dot.vdom.role).toBe('img');
        expect(dot.vdom['aria-label']).toBe('wedged');

        dot.destroy()
    });

    test('the accessible name follows a state change, so it can never describe a stale state', () => {
        const dot = Neo.create(StateDot, {appName, state: 'ok'});

        expect(dot.vdom['aria-label']).toBe('working');

        dot.state = 'limited';

        expect(dot.vdom['aria-label']).toBe('rate-limited');
        // the colour class tracks the same transition — name and hue cannot disagree
        expect(dot.cls).toContain(stateClass('limited'));
        expect(dot.cls).not.toContain(stateClass('ok'));

        dot.destroy()
    });

    test('an unknown state degrades to the off TOKEN while the name stays literal', () => {
        const dot = Neo.create(StateDot, {appName, state: 'some-new-state'});

        // colour degrades to the neutral token (a hue must not be invented for an unknown state) …
        expect(stateToken('some-new-state')).toBe('--fm-state-off');
        expect(dot.cls).toContain('fm-state-off');
        // … but the NAME stays literal, so the operator is told what the runtime actually reported
        // rather than being shown a confident "benched / offline" that is not what happened.
        expect(dot.vdom['aria-label']).toBe('some-new-state');

        dot.destroy()
    });
});
