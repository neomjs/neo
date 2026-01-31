import {setup} from '../../setup.mjs';

const appName = 'VdomMergingTest';

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
import Button             from '../../../../src/button/Base.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

class TestContainer extends Container {
    static config = {
        className: 'Test.Unit.Vdom.VdomMerging.Container',
        ntype    : 'test-unit-vdom-vdommerging-container',
        layout   : {ntype: 'vbox'},
        style    : {color: 'black'}
    }
}
TestContainer = Neo.setupClass(TestContainer);

test.describe('Neo.vdom.VdomMerging', () => {
    let container, button, testRun = 0;

    test.beforeEach(async () => {
        await Promise.resolve();
        testRun++;
        container = Neo.create(TestContainer, {
            appName,
            id   : 'test-container-' + testRun,
            items: [
                {
                    module: Button,
                    id    : 'test-button-' + testRun,
                    text  : 'Initial Button'
                }
            ]
        });

        await container.initVnode();
        button = container.items[0];
        container.mounted = true;
    });

    test.afterEach(() => {
        container.destroy();
        container = null;
        button    = null;
    });

    test('Should merge parent style update and child text update', async () => {
        container.setSilent({style: {color: 'red'}});
        button.setSilent({text: 'Updated Button'});

        const {deltas} = await container.promiseUpdate();

        expect(deltas.length).toBe(2);

        const parentDelta = deltas.find(d => d.id === container.id);
        const childDelta  = deltas.find(d => d.id !== container.id); // Get the other delta

        expect(parentDelta).toBeTruthy();
        expect(parentDelta.style.color).toBe('red');

        expect(childDelta).toBeTruthy();
    });
});
