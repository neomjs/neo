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
    let StateDot, stateToken;

    test.beforeAll(async () => {
        const dot = await import('../../../../../../../apps/agentos/view/fleet/StateDot.mjs');

        StateDot   = dot.default;
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
        expect(stateToken(undefined)).toBe('--fm-state-off')
    });

    test('StateDot binds the token via --fm-dot and gates the pulse behind the live config', async () => {
        const dot = Neo.create(StateDot, {appName, state: 'wedged', live: true});
        await dot.initVnode();

        expect(dot.vdom.style['--fm-dot']).toBe('var(--fm-state-wedged)');
        expect(dot.vdom.cls).toContain('fm-state-dot');
        expect(dot.vdom.cls).toContain('fm-live');

        // reduced-motion config path: dropping live removes the pulse class; the color (signal) stays
        dot.live = false;
        expect(dot.vdom.cls).toContain('fm-state-dot');
        expect(dot.vdom.cls).not.toContain('fm-live');
        expect(dot.vdom.style['--fm-dot']).toBe('var(--fm-state-wedged)');

        dot.destroy()
    });

    test('StateDot renders unknown state as off, never a broken color', async () => {
        const dot = Neo.create(StateDot, {appName, state: 'nonsense'});
        await dot.initVnode();

        expect(dot.vdom.style['--fm-dot']).toBe('var(--fm-state-off)');
        expect(dot.vdom.cls).not.toContain('fm-live');

        dot.destroy()
    });
});
