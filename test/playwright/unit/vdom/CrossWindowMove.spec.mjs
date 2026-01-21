import {setup} from '../../setup.mjs';

const appName = 'CrossWindowMoveTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class TestHeader extends Component {
    static config = {
        className: 'Test.Header',
        ntype    : 'test-header',
        text     : 'Header'
    }
}
TestHeader = Neo.setupClass(TestHeader);

class TestPanel extends Container {
    static config = {
        className: 'Test.Panel',
        ntype    : 'test-panel',
        items    : [{ntype: 'test-header', id: 'header-1'}]
    }
}
TestPanel = Neo.setupClass(TestPanel);

class TestContainer extends Container {
    static config = {
        className: 'Test.Container',
        ntype    : 'test-container',
        layout   : {ntype: 'hbox', align: 'stretch'},
        items    : [
            {ntype: 'component', id: 'helix-1', text: 'Helix'},
            {ntype: 'test-panel', id: 'panel-1'}
        ]
    }
}
TestContainer = Neo.setupClass(TestContainer);

test.describe('Neo.vdom.CrossWindowMove', () => {
    let container, panel, header;

    test.beforeEach(async () => {
        if (!Neo.currentWorker) {
            Neo.currentWorker = {};
        }
        if (!Neo.currentWorker.insertThemeFiles) {
            Neo.currentWorker.insertThemeFiles = () => {};
        }

        container = Neo.create(TestContainer, {
            appName,
            id: 'viewport'
        });
        await container.initVnode();
        panel  = container.items[1];
        header = panel.items[0];
        container.mounted = true;
    });

    test.afterEach(() => {
        container.destroy();
    });

    test('Should handle removing a child component (Panel) after child state change without Ghost Content', async () => {
        // 1. Force an intermediate Disjoint Update (Depth 1)
        await container.promiseUpdate();

        // 2. Trigger a state change on the child (Header)
        header.hidden = true;

        // 3. Change windowId (Simulate move to new window)
        // This is crucial for testing the windowId filtering in executeVdomUpdate
        panel.windowId = 'new-window';

        // 4. Remove the Panel
        container.remove(panel, false);

        // Verify VDOM state immediately
        const vdomChildren = container.vdom.cn;
        const hasPanel = JSON.stringify(vdomChildren).includes('panel-1');
        
        expect(hasPanel).toBe(false);

        // 5. Trigger update
        await expect(container.promiseUpdate()).resolves.not.toThrow();
    });
});