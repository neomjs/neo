import {setup} from '../../../setup.mjs';

const appName = 'FileExplorerDetailPaneUnitTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import DetailPane     from '../../../../../examples/fileExplorer/DetailPane.mjs';

test.describe('Neo.examples.fileExplorer.DetailPane', () => {
    test('renders centered plain EmptyState when details is null and transitions cleanly across entries and back', () => {
        const pane  = Neo.create(DetailPane, {appName}),
              empty = pane.down({reference: 'empty-state'}),
              body  = pane.down({reference: 'detail-body'});

        expect(pane.vdom.tag).toBe('section');
        expect(empty.className).toBe('Neo.component.EmptyState');
        expect(empty.ui).toBe('plain');
        expect(empty.contentAlign).toBe('center');
        expect(empty.hidden).toBe(false);
        expect(empty.text).toBe('Select a file or a folder to see its details.');
        expect(body.hidden).toBe(true);

        pane.details = {
            icon: ['fe-icon', 'fe-kind-script'],
            name: 'Cart.mjs',
            path: '/src/components/Cart.mjs',
            rows: [['Kind', 'JavaScript module'], ['Size', '2.1 KB']]
        };

        expect(empty.hidden).toBe(true);
        expect(body.hidden).toBe(false);
        expect(body.vdom.cn[0].cn[1].text).toBe('Cart.mjs');
        expect(body.vdom.cn[1].text).toBe('/src/components/Cart.mjs');

        pane.details = {
            icon: ['fe-icon', 'fe-kind-folder'],
            name: 'components',
            path: '/src/components',
            rows: [['Kind', 'Folder'], ['Entries', '4 items']]
        };

        expect(empty.hidden).toBe(true);
        expect(body.hidden).toBe(false);
        expect(body.vdom.cn[0].cn[1].text).toBe('components');

        pane.details = null;
        expect(empty.hidden).toBe(false);
        expect(body.hidden).toBe(true);
        expect(body.vdom.cn).toEqual([]);

        pane.destroy()
    })
});
