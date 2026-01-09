import {setup} from '../../setup.mjs';

const appName = 'ProgressTest';

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
import Progress       from '../../../../src/component/Progress.mjs';

test.describe('Progress Component', () => {

    test('Label "for" attribute should sync with ID', async () => {
        const progress = Neo.create(Progress, {
            appName,
            id: 'my-progress',
            labelText: 'Loading...'
        });

        // Check initial state
        const label = progress.vdom.cn[0];
        expect(label.for).toBe('my-progress');

        // Change ID
        progress.id = 'new-id';

        // Check update
        expect(label.for).toBe('new-id');

        progress.destroy();
    });
});
