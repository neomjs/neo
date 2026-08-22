import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetHealthSwatchTest';

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

test.describe('Fleet cockpit HealthSwatch — state-axis legend + count-bar unit (#14637)', () => {
    let HealthSwatch, stateLabel;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../../apps/agentos/view/fleet/health/SwatchComponent.mjs');

        HealthSwatch = mod.default;
        stateLabel   = mod.stateLabel
    });

    test('stateLabel gives canonical labels; an unknown category → its LITERAL text (never off, never invisible)', () => {
        expect(stateLabel('ok')).toBe('working');
        expect(stateLabel('limited')).toBe('rate-limited');
        expect(stateLabel('off')).toBe('benched / offline');
        expect(stateLabel('some-new-state')).toBe('some-new-state');
        expect(stateLabel(undefined)).toBe('unknown');
        // prototype-shaped keys resolve to their literal text, never an inherited Object.prototype value
        expect(stateLabel('toString')).toBe('toString');
        expect(stateLabel('constructor')).toBe('constructor');
        expect(stateLabel('__proto__')).toBe('__proto__')
    });

    test('renders a legend row (no count) — state dot + label, no count element', async () => {
        const sw = Neo.create(HealthSwatch, {appName, state: 'wedged'});
        await sw.initVnode();

        const dot   = sw.vdom.cn.find(n => n.cls?.includes('fm-sw-dot')),
              label = sw.vdom.cn.find(n => n.cls?.includes('fm-sw-label')),
              count = sw.vdom.cn.find(n => n.cls?.includes('fm-sw-count'));

        // the ROOT carries the state class; SCSS binds --fm-dot from it (inherited by the dot) — no inline style
        expect(sw.vdom.cls).toContain('fm-state-wedged');
        expect(dot.style?.['--fm-dot']).toBeUndefined();
        expect(label.text).toBe('wedged');
        // class-idiom: the count node stays in cn, removeDom-toggled (not omitted) — so a plain
        // legend row renders no count element in the DOM.
        expect(count.removeDom).toBe(true);

        sw.destroy()
    });

    test('renders the count-bar unit when count is set (#14599 consumer shape), incl a zero count', async () => {
        const sw = Neo.create(HealthSwatch, {appName, state: 'ok', count: 3});
        await sw.initVnode();

        expect(sw.vdom.cn.find(n => n.cls?.includes('fm-sw-count'))?.text).toBe('3');
        expect(sw.vdom.cn.find(n => n.cls?.includes('fm-sw-label')).text).toBe('working');

        // a zero count still renders (a health bar shows "0 wedged" to confirm none) — not falsy-dropped
        sw.count = 0;
        expect(sw.vdom.cn.find(n => n.cls?.includes('fm-sw-count'))?.text).toBe('0');

        sw.destroy()
    });

    test('renders an unknown category off-toned with its literal text (never invisible)', async () => {
        const sw = Neo.create(HealthSwatch, {appName, state: 'mystery'});
        await sw.initVnode();

        const label = sw.vdom.cn.find(n => n.cls?.includes('fm-sw-label'));

        expect(sw.vdom.cls).toContain('fm-state-off');
        expect(label.text).toBe('mystery');

        sw.destroy()
    });

    test('a prototype-shaped unknown state renders off-toned with its literal text (no inherited leak on either axis)', async () => {
        const sw = Neo.create(HealthSwatch, {appName, state: 'toString'});
        await sw.initVnode();

        const label = sw.vdom.cn.find(n => n.cls?.includes('fm-sw-label'));

        // both the dot class (via stateClass) and the label (via stateLabel) must be closed-set-safe
        expect(sw.vdom.cls).toContain('fm-state-off');
        expect(label.text).toBe('toString');

        sw.destroy()
    });

    test('honors a label override', async () => {
        const sw = Neo.create(HealthSwatch, {appName, state: 'idle', label: 'napping'});
        await sw.initVnode();

        expect(sw.vdom.cn.find(n => n.cls?.includes('fm-sw-label')).text).toBe('napping');

        sw.destroy()
    });
});
