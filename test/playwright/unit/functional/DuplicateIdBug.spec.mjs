import {setup} from '../../setup.mjs';

const appName = 'DuplicateIdTest';

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
import {defineComponent}  from '../../../../src/functional/_export.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import Button             from '../../../../src/button/Base.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';

test.describe('Functional Component Duplicate ID Bug', () => {
    let container;

    test.beforeEach(async () => {
        container = Neo.create(Container, {
            appName,
            id: 'test-container',
            layout: {ntype: 'fit'}
        });
        await container.initVnode();
        container.mounted = true;
    });

    test.afterEach(() => {
        container?.destroy();
        container = null;
    });

    test('Live preview recreation bug - First example', async () => {
        const createModule = (buttonText) => {
            // Live Preview deletes the old class from the namespace before re-defining it
            let ns = Neo.ns('GS.describing.functional');
            if (ns) {
                delete ns['MainView'];
            }
            
            return defineComponent({
                config: {
                    className: 'GS.describing.functional.MainView'
                },
            
                createVdom(config) {
                    return {
                        cn: [{
                            ntype: 'container',
                            layout: {ntype: 'vbox', align: 'start'},
                            items: [{
                                ntype: 'button',
                                iconCls: 'fa fa-home',
                                text: buttonText
                            }]
                        }]
                    }
                }
            });
        };

        // First execution of live preview code
        let MainView1 = createModule('Home');
        
        let fnCmp1 = Neo.create(MainView1, {
            appName
        });
        
        container.add(fnCmp1);
        await container.timeout(50);

        expect(fnCmp1.vdom.cn[0].componentId).toBeDefined();

        // Simulate Live Preview destroying the old container content
        // destroyItems=true, silent=true (similar to what executor does initially, but executor uses true, true)
        // Wait, executor actually does container.removeAll(true, true);
        // Let's do container.removeAll(true, false) to ensure VDOM updates, or just destroy the instance.
        container.removeAll(true, false);
        await container.timeout(50);

        // Second execution of live preview code with a change
        let MainView2 = createModule('Home changed');

        let fnCmp2 = Neo.create(MainView2, {
            appName
        });

        container.add(fnCmp2);
        await container.timeout(50);

        // Ensure it rendered correctly the second time
        expect(container.items[0]).toBeDefined();
        expect(container.items[0].id).toBe(fnCmp2.id);
    });
});
