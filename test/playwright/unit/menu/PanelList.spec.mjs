import { setup } from '../../setup.mjs';

const appName = 'MenuPanelListTest';

setup({
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import Instance         from '../../../../src/manager/Instance.mjs';
import MenuPanel        from '../../../../src/menu/Panel.mjs';

test.describe('Neo.menu.Panel', () => {

    test('adds its list before its layout exists, and lays the list out once it does', () => {
        // afterSetList() adds the list while the container's layout is still its config object
        const panel = Neo.create(MenuPanel, {
            appName,
            listConfig: {displayField: 'text'},
            listItems : [{text: 'Item 1'}, {text: 'Item 2'}]
        });

        expect(panel.items).toEqual([panel.list]);
        // the default vbox layout with align: 'stretch' flexes its items
        expect(panel.list.wrapperStyle.flex).toBe('1 1 0%');

        panel.destroy()
    });
});
