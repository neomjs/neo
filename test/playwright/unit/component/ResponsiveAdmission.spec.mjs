import {setup} from '../../setup.mjs';

const appName = 'ResponsiveAdmissionTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import Viewport       from '../../../../src/container/Viewport.mjs';

/**
 * @summary A component builds one Responsive plugin, however often `responsive` is set before the plugin's import
 * settles. A lookup made before the import cannot reserve the slot, so `afterSetResponsive` decides admission once the
 * import has settled. The plugin reads `owner.responsive` on every resize, so a later value needs no second plugin.
 */
test.describe('Neo.component.Base#responsive', () => {
    let component, defaultViewport;

    test.beforeAll(() => {
        defaultViewport = Neo.create(Viewport, {
            appName,
            applyBodyCls: false,
            autoMount   : false,
            id          : 'responsive-admission-viewport'
        });
        Neo.apps[1].mainView = defaultViewport
    });

    test.afterAll(() => {
        defaultViewport?.destroy();
        defaultViewport = null
    });

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
            viewport1 = Neo.create(Viewport, {
                appName,
                applyBodyCls: false,
                autoMount   : false,
                id          : 'custom-viewport-win-1',
                windowId    : 11
            }),
            viewport2 = Neo.create(Viewport, {
                appName,
                applyBodyCls: false,
                autoMount   : false,
                id          : 'custom-viewport-win-2',
                windowId    : 12
            });

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

            viewport1.fire('resize', {rect: {width: 800, height: 600}, contentRect: {width: 800, height: 600}});
            expect(component.cls).toContain('is-narrow');

            viewport2.fire('resize', {rect: {width: 800, height: 600}, contentRect: {width: 800, height: 600}});
            expect(component.cls).toContain('is-wide');
        } finally {
            viewport1.destroy();
            viewport2.destroy();
            delete Neo.apps[11];
            delete Neo.apps[12];
        }
    });

    test('getViewport resolves a Viewport when mainView is a non-Viewport container', async () => {
        const nonViewportMainView = Neo.create(Container, {
            appName,
            id      : 'non-viewport-main-view',
            windowId: 13
        });

        Neo.apps[13] = {name: appName, mainView: nonViewportMainView, isMounted: () => true, on: () => {}, un: () => {}, fire: () => {}};

        try {
            component = Neo.create(Component, {
                appName,
                windowId  : 13,
                responsive: {landscape: {cls: ['is-landscape']}}
            });

            await expect.poll(() => responsivePlugins().length).toBe(1);
            const [plugin] = responsivePlugins();

            component.mounted = true;

            expect(plugin.viewport).toBe(defaultViewport);
            expect(plugin.viewport).not.toBe(nonViewportMainView);

            defaultViewport.fire('resize', {rect: {width: 900, height: 500}, contentRect: {width: 900, height: 500}});
            expect(component.cls).toContain('is-landscape');
        } finally {
            nonViewportMainView.destroy();
            delete Neo.apps[13];
        }
    })
});
