import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'HeaderGroupsThemeTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainContainer  from '../../../../../../examples/grid/headerGroups/MainContainer.mjs';

/**
 * @summary Runs the shipped handler with a controlled remote boundary and restores that boundary afterwards.
 * @param {Function} run Receives a minimal viewport context and an engine-call replacement setter.
 * @returns {Promise<void>}
 */
async function withThemeSwitch(run) {
    const original = Neo.main.DomAccess,
          access   = original ?? Neo.ns('Neo.main.DomAccess', true),
          start    = access.startViewTransition,
          context  = {
              windowId: 'header-groups-window',
              theme   : 'neo-theme-neo-light',
              syncs   : 0,
              getTheme() { return this.theme },
              syncThemeButton() { this.syncs++ }
          };

    try {
        await run(context, fn => access.startViewTransition = fn)
    } finally {
        if (original) {
            start ? access.startViewTransition = start : delete access.startViewTransition
        } else {
            delete Neo.main.DomAccess
        }
    }
}

test('the old theme remains until capture starts, with the raw origin and window identity', async () => {
    await withThemeSwitch(async (context, replace) => {
        let release, request;
        replace(data => {
            request = data;
            return new Promise(resolve => release = resolve)
        });
        const pending = MainContainer.prototype.onThemeButtonClick.call(context, {clientX: 0, clientY: 12});
        expect(context.theme).toBe('neo-theme-neo-light');
        expect(context.syncs).toBe(0);
        expect(request).toEqual({delay: 100, reveal: {x: 0, y: 12}, windowId: context.windowId});
        release(true);
        await pending;
        expect(context.theme).toBe('neo-theme-neo-dark');
        expect(context.syncs).toBe(1)
    })
});

for (const mode of ['unsupported', 'rejected', 'no event']) {
    test(`theme switching remains functional with ${mode}`, async () => {
        await withThemeSwitch(async (context, replace) => {
            let request;
            context.theme = 'neo-theme-neo-dark';
            replace(async data => {
                request = data;
                if (mode === 'rejected') throw new Error('decorative remote call failed');
                return mode !== 'unsupported'
            });
            await MainContainer.prototype.onThemeButtonClick.call(context,
                mode === 'no event' ? undefined : {clientX: 40, clientY: 20});
            expect(context.theme).toBe('neo-theme-neo-light');
            expect(context.syncs).toBe(1);
            if (mode === 'no event') {
                expect(request.reveal).toEqual({x: undefined, y: undefined})
            }
        })
    })
}
