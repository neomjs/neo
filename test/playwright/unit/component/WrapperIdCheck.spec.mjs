import {setup} from '../../setup.mjs';

const appName = 'WrapperIdCheck';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import SplitButton    from '../../../../src/button/Split.mjs';
import GridBody       from '../../../../src/grid/Body.mjs';

test.describe('Wrapper Component IDs', () => {

    test('SplitButton should have correct wrapper ID', async () => {
        const btn = Neo.create(SplitButton, {
            appName,
            id: 'my-split'
        });

        // The root vdom node (the wrapper) should have the wrapper suffix
        expect(btn.vdom.id).toBe('my-split__wrapper');
        // The getVdomRoot() node (the actual button) should have the component ID
        expect(btn.getVdomRoot().id).toBe('my-split');

        btn.destroy();
    });

    test('GridBody should have correct wrapper ID', async () => {
        const mockGrid = {
            id: 'mock-grid',
            on: () => {},
            isClass: true,
            vdom: {id: 'mock-grid'}
        };

        const gridBody = Neo.create(GridBody, {
            appName,
            id: 'my-grid-body',
            parentComponent: mockGrid
        });

        // The root vdom node (the wrapper) should have the wrapper suffix
        expect(gridBody.vdom.id).toBe('my-grid-body__wrapper');
        // The getVdomRoot() node should have the component ID
        expect(gridBody.getVdomRoot().id).toBe('my-grid-body');

        // Unregister manually to avoid destroy() complexity with mock parent
        Neo.manager.Component.unregister(gridBody);
    });
});
