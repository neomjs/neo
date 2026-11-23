/**
 * @file test/playwright/unit/list/Chip.spec.mjs
 * @summary A chip list hands its window to every chip it creates, so the chip's theme files load.
 */

import {setup} from '../../setup.mjs';

const appName = 'ListChipTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ChipComponent  from '../../../../src/component/Chip.mjs';
import ChipList       from '../../../../src/list/Chip.mjs';

test.describe('Neo.list.Chip', () => {
    let insertThemeFiles, list;

    test.beforeEach(() => {
        insertThemeFiles = Neo.currentWorker.insertThemeFiles
    });

    test.afterEach(() => {
        Neo.currentWorker.insertThemeFiles = insertThemeFiles;

        list?.destroy();
        list = null
    });

    test('a chip created after the list has a window gets that window and loads its theme files (#21349)', () => {
        const calls = [];

        Neo.currentWorker.insertThemeFiles = (windowId, proto) => calls.push({proto, windowId});

        list = Neo.create(ChipList, {appName, windowId: 1});

        // A store that loads later, like the chip field's url store, fills the list after it has a window
        list.store = {data: [{id: 'a', name: 'Alpha'}, {id: 'b', name: 'Beta'}]};

        expect(list.items.map(item => item.windowId)).toEqual([1, 1]);
        expect(calls.some(call => call.windowId === 1 && call.proto === ChipComponent.prototype)).toBe(true)
    })
});
