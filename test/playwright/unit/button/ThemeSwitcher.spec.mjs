import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Container      from '../../../../src/container/Base.mjs';
import ThemeSwitcher  from '../../../../src/button/ThemeSwitcher.mjs';

const appName = 'Test.Unit.ThemeSwitcher',
      light   = 'neo-theme-neo-light',
      dark    = 'neo-theme-neo-dark',
      classic = 'neo-theme-dark',
      studio  = 'neo-theme-company-studio-night';

setup({
    neoConfig: {themes: [light, dark, classic, studio]},
    appConfig: {name: appName}
});

test.describe('ThemeSwitcher transition ownership', () => {
    let host, switcher, originalDomAccess, reducedMotion;

    test.beforeEach(() => {
        originalDomAccess = Neo.main.DomAccess;
        reducedMotion = Neo.config.prefersReducedMotion;
        Neo.config.prefersReducedMotion = false;

        host = Neo.create(Container, {appName, theme: light});
        switcher = Neo.create(ThemeSwitcher, {appName, target: host, themes: [light, dark]})
    });

    test.afterEach(() => {
        switcher?.destroy();
        host?.destroy();
        Neo.main.DomAccess = originalDomAccess;
        Neo.config.prefersReducedMotion = reducedMotion
    });

    test('applies the selected theme if the reveal cannot reach the window', async () => {
        const reveal = [];
        Neo.main.DomAccess = {
            ...originalDomAccess,
            startViewTransition(data) {
                reveal.push(data);
                return Promise.reject(new Error('transition transport unavailable'))
            }
        };

        await switcher.selectTheme(dark, {clientX: 42, clientY: 84});

        expect(reveal).toEqual([{delay: 100, reveal: {x: 42, y: 84}, windowId: host.windowId}]);
        expect(host.getTheme()).toBe(dark);
        expect(switcher.ariaLabel).toBe('Switch to Neo Light')
    });

    test('keeps the newer host theme when a decorative reveal is still pending', async () => {
        let finish;
        Neo.main.DomAccess = {
            ...originalDomAccess,
            startViewTransition() {
                return new Promise(resolve => {finish = resolve})
            }
        };

        const pending = switcher.selectTheme(dark, {clientX: 32, clientY: 12});
        host.theme = classic;
        finish(true);
        await pending;

        expect(host.getTheme()).toBe(classic)
    });

    test('applies the selected theme without a reveal when reduced motion is enabled', async () => {
        let calls = 0;
        Neo.config.prefersReducedMotion = true;
        Neo.main.DomAccess = {
            ...originalDomAccess,
            startViewTransition() {
                calls++;
                return Promise.resolve(true)
            }
        };

        await switcher.selectTheme(dark);

        expect(host.getTheme()).toBe(dark);
        expect(calls).toBe(0)
    })
});

test('refreshes workspace theme labels in the trigger and menu while retaining built-in names', async () => {
    const host     = Neo.create(Container, {appName, theme: studio}),
          switcher = Neo.create(ThemeSwitcher, {appName, target: host, themeLabels: {[studio]: 'Atlas Preview'}}),
          choices  = () => switcher.menuList.store.items.map(({id, text}) => [id, text]);

    try {
        await switcher.menuListReady;

        expect(switcher.ariaLabel).toBe('Theme: Atlas Preview');
        expect(choices()).toEqual([[light, 'Neo Light'], [dark, 'Neo Dark'], [classic, 'Dark'], [studio, 'Atlas Preview']]);

        switcher.themeLabels = {[light]: 'Day shift', [studio]: 'Atlas Night'};
        await switcher.menuListReady;

        expect(switcher.ariaLabel).toBe('Theme: Atlas Night');
        expect(choices()).toEqual([[light, 'Day shift'], [dark, 'Neo Dark'], [classic, 'Dark'], [studio, 'Atlas Night']]);
        expect(host.getTheme()).toBe(studio)
    } finally {
        switcher.destroy();
        host.destroy()
    }
});
