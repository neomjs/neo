import {setup} from '../../../../../setup.mjs';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

test.describe('Fleet cockpit StateDot — session-state token mapping + reduced-motion (#14593)', () => {
    let StateDot, stateClass, stateToken;

    test.beforeAll(async () => {
        const dot = await import('../../../../../../../apps/agentos/view/fleet/StateDot.mjs');

        StateDot   = dot.default;
        stateClass = dot.stateClass;
        stateToken = dot.stateToken
    });

    test('stateToken maps each session state to its --fm-state-* token (session state, never identity)', () => {
        expect(stateToken('ok')).toBe('--fm-state-ok');
        expect(stateToken('idle')).toBe('--fm-state-idle');
        expect(stateToken('wedged')).toBe('--fm-state-wedged');
        expect(stateToken('limited')).toBe('--fm-state-limited');
        expect(stateToken('off')).toBe('--fm-state-off');
        // unknown / undefined falls back to off — never throws, never a hand-rolled color
        expect(stateToken('nonsense')).toBe('--fm-state-off');
        expect(stateToken(undefined)).toBe('--fm-state-off');
        // prototype-shaped keys must not leak an inherited Object.prototype value past the closed set
        expect(stateToken('toString')).toBe('--fm-state-off');
        expect(stateToken('constructor')).toBe('--fm-state-off');
        expect(stateToken('__proto__')).toBe('--fm-state-off')
    });

    test('stateClass is the token minus the custom-property prefix — the class the SCSS token binding keys on', () => {
        expect(stateClass('ok')).toBe('fm-state-ok');
        expect(stateClass('wedged')).toBe('fm-state-wedged');
        // shares the closed-set degrade — unknown / prototype-shaped → the neutral off class
        expect(stateClass('nonsense')).toBe('fm-state-off');
        expect(stateClass(undefined)).toBe('fm-state-off');
        expect(stateClass('__proto__')).toBe('fm-state-off')
    });

    test('StateDot binds the token via its state class (zero inline styles) and gates the pulse behind the live config', async () => {
        const dot = Neo.create(StateDot, {appName, state: 'wedged', live: true});
        await dot.initVnode();

        // the class carries the color binding (SCSS maps it onto --fm-dot); no inline style write
        expect(dot.vdom.cls).toContain('fm-state-wedged');
        expect(dot.vdom.style?.['--fm-dot']).toBeUndefined();
        expect(dot.vdom.cls).toContain('fm-state-dot');
        expect(dot.vdom.cls).toContain('fm-live');

        // a state transition swaps the class in place — old class out, new class in
        dot.state = 'ok';
        expect(dot.vdom.cls).toContain('fm-state-ok');
        expect(dot.vdom.cls).not.toContain('fm-state-wedged');

        // reduced-motion config path: dropping live removes the pulse class; the color (signal) stays
        dot.live = false;
        expect(dot.vdom.cls).toContain('fm-state-dot');
        expect(dot.vdom.cls).not.toContain('fm-live');
        expect(dot.vdom.cls).toContain('fm-state-ok');

        dot.destroy()
    });

    test('StateDot renders unknown state as off, never a broken color', async () => {
        const dot = Neo.create(StateDot, {appName, state: 'nonsense'});
        await dot.initVnode();

        expect(dot.vdom.cls).toContain('fm-state-off');
        expect(dot.vdom.style?.['--fm-dot']).toBeUndefined();
        expect(dot.vdom.cls).not.toContain('fm-live');

        dot.destroy()
    });
});
