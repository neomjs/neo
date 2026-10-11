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
    })
});
