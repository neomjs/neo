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

test.describe('Fleet cockpit StateDot — session-state token mapping + reduced-motion (#14593)', () => {
    let StateDot, stateClass, stateToken;

    test.beforeAll(async () => {
        const dot = await import('../../../../../../../../apps/agentos/view/fleet/shared/StateDotComponent.mjs');

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
        // the transitional pair (a lifecycle intent in flight) — a first-party fact, not the runtime wire
        expect(stateToken('starting')).toBe('--fm-state-starting');
        expect(stateToken('stopping')).toBe('--fm-state-stopping');
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
        expect(stateClass('starting')).toBe('fm-state-starting');
        expect(stateClass('stopping')).toBe('fm-state-stopping');
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

    test('StateDot live enforces one class membership without disturbing caller or base classes (#15201)', async () => {
        const
            dot      = Neo.create(StateDot, {appName, state: 'ok', live: false}),
            observed = [];

        await dot.initVnode();
        dot.addCls('caller-authored');

        const cleanup = dot.observeConfig(dot, 'cls', cls => observed.push([...cls]));

        dot.live = true;
        dot.live = true;

        expect(observed).toHaveLength(1);
        expect(observed[0]).toContain('fm-state-dot');
        expect(observed[0]).toContain('caller-authored');
        expect(observed[0].filter(cls => cls === 'fm-live')).toHaveLength(1);

        dot.live = false;
        dot.live = false;

        expect(observed).toHaveLength(2);
        expect(observed[1]).toContain('fm-state-dot');
        expect(observed[1]).toContain('caller-authored');
        expect(observed[1]).not.toContain('fm-live');

        cleanup();
        dot.destroy()
    });

    test('StateDot binds the transitional starting/stopping classes in place (#14978)', async () => {
        const dot = Neo.create(StateDot, {appName, state: 'starting'});
        await dot.initVnode();

        expect(dot.vdom.cls).toContain('fm-state-starting');
        expect(dot.vdom.style?.['--fm-dot']).toBeUndefined();   // color stays in the token layer

        dot.state = 'stopping';
        expect(dot.vdom.cls).toContain('fm-state-stopping');
        expect(dot.vdom.cls).not.toContain('fm-state-starting');

        // and back to a resolved state once the intent settles
        dot.state = 'ok';
        expect(dot.vdom.cls).toContain('fm-state-ok');
        expect(dot.vdom.cls).not.toContain('fm-state-stopping');

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
