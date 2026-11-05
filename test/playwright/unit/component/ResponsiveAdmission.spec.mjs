import {setup} from '../../setup.mjs';

const
    appName  = 'ResponsiveAdmissionTest',
    // The Responsive plugin wires resize listeners on the app's viewport, which the unit tier has no main thread for
    viewport = {id: 'responsive-admission-viewport', addDomListeners() {}},
    // Neo.first() walks down from the app's main view, so every query answers with the stand-in viewport
    mainView = {id: 'responsive-admission-main-view', down: () => viewport};

setup({
    appConfig: {
        name: appName,
        mainView
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';

/**
 * @summary A component builds one Responsive plugin, however often `responsive` is set before the plugin's import
 * settles. A lookup made before the import cannot reserve the slot, so `afterSetResponsive` decides admission once the
 * import has settled. The plugin reads `owner.responsive` on every resize, so a later value needs no second plugin.
 */
test.describe('Neo.component.Base#responsive', () => {
    let component;

    test.afterEach(() => {
        component?.destroy();
        component = null
    });

    /**
     * @returns {Neo.plugin.Responsive[]}
     */
    const responsivePlugins = () => (component.plugins || []).filter(plugin => plugin.ntype === 'plugin-responsive');

    test('two values set before the plugin has loaded build one plugin', async () => {
        component = Neo.create(Component, {appName});

        component.responsive = {small: {cls: ['a']}};
        component.responsive = {small: {cls: ['b']}};

        await expect.poll(() => responsivePlugins().length, {message: 'the plugin loaded'}).toBeGreaterThan(0);

        // Both continuations resolve from the same import, one right after the other
        await component.timeout(50);

        expect(responsivePlugins()).toHaveLength(1)
    });

    test('a value set once the plugin exists builds none', async () => {
        component = Neo.create(Component, {appName, responsive: {small: {cls: ['a']}}});

        await expect.poll(() => responsivePlugins().length, {message: 'the plugin loaded'}).toBe(1);

        component.responsive = {small: {cls: ['b']}};
        await component.timeout(50);

        expect(responsivePlugins()).toHaveLength(1)
    });

    test('turned off, the plugin idles through a resize, and the next value resumes it', async () => {
        const landscape = {rect: {height: 600, width: 800}};

        component = Neo.create(Component, {appName, responsive: {landscape: {cls: ['wide']}}});

        await expect.poll(() => responsivePlugins().length, {message: 'the plugin loaded'}).toBe(1);

        const [plugin] = responsivePlugins();

        component.responsive = null;
        expect(() => plugin.onResize(landscape), 'a resize while responsive is off').not.toThrow();

        component.responsive = {landscape: {cls: ['wider']}};
        await component.timeout(50);
        plugin.onResize(landscape);

        expect(responsivePlugins(), 'the same plugin').toEqual([plugin]);
        expect(component.cls, 'applied the new value').toContain('wider')
    });

    test('binds to the matching Viewport custom resize event on mount, rebinds across window moves, and avoids Neo.Responsive global', async () => {
        const
            listeners1 = [],
            listeners2 = [],
            viewport1  = {
                id         : 'custom-viewport-win-1',
                monitorSize: false,
                on(event, fn, scope) {
                    listeners1.push({event, fn, scope});
                },
                un(event, fn, scope) {
                    const idx = listeners1.findIndex(l => l.event === event && l.fn === fn && l.scope === scope);
                    if (idx > -1) listeners1.splice(idx, 1);
                },
                fire(event, data) {
                    listeners1.filter(l => l.event === event).slice().forEach(l => l.fn.call(l.scope, data));
                }
            },
            viewport2  = {
                id         : 'custom-viewport-win-2',
                monitorSize: false,
                on(event, fn, scope) {
                    listeners2.push({event, fn, scope});
                },
                un(event, fn, scope) {
                    const idx = listeners2.findIndex(l => l.event === event && l.fn === fn && l.scope === scope);
                    if (idx > -1) listeners2.splice(idx, 1);
                },
                fire(event, data) {
                    listeners2.filter(l => l.event === event).slice().forEach(l => l.fn.call(l.scope, data));
                }
            };

        Neo.apps[11] = {name: appName, mainView: viewport1, isMounted: () => true, on: () => {}, un: () => {}, fire: () => {}};
        Neo.apps[12] = {name: appName, mainView: viewport2, isMounted: () => true, on: () => {}, un: () => {}, fire: () => {}};

        try {
            component = Neo.create(Component, {
                appName,
                windowId        : 11,
                responsive      : {narrow: {cls: ['is-narrow']}, wide: {cls: ['is-wide']}},
                responsiveConfig: {
                    narrow: {maxWidth: 500},
                    wide  : {minWidth: 501}
                }
            });

            await expect.poll(() => responsivePlugins().length).toBe(1);
            const [plugin] = responsivePlugins();

            expect(Neo.Responsive).toBeUndefined();
            expect(plugin.responsiveConfig).toBeInstanceOf(Map);
            expect(plugin.responsiveConfig.has('narrow')).toBe(true);

            expect(plugin.viewport).toBeNull();
            expect(viewport1.monitorSize).toBe(false);

            component.mounted = true;

            expect(plugin.viewport).toBe(viewport1);
            expect(viewport1.monitorSize).toBe(true);
            expect(plugin.constructor.apps[11]).toEqual({
                appId           : 'custom-viewport-win-1',
                activeBodyUpdate: true
            });

            viewport1.fire('resize', {rect: {width: 400, height: 600}, contentRect: {width: 400, height: 600}});
            expect(component.cls).toContain('is-narrow');

            component.mounted  = false;
            component.windowId = 12;
            component.mounted  = true;

            expect(plugin.viewport).toBe(viewport2);
            expect(viewport2.monitorSize).toBe(true);
            expect(listeners1.some(l => l.fn === plugin.onResize && l.scope === plugin)).toBe(false);

            viewport1.fire('resize', {rect: {width: 800, height: 600}, contentRect: {width: 800, height: 600}});
            expect(component.cls).toContain('is-narrow');

            viewport2.fire('resize', {rect: {width: 800, height: 600}, contentRect: {width: 800, height: 600}});
            expect(component.cls).toContain('is-wide');
        } finally {
            delete Neo.apps[11];
            delete Neo.apps[12];
        }
    })
});
