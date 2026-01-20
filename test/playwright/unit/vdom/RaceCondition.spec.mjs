import {setup} from '../../setup.mjs';

const appName = 'RaceConditionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Component          from '../../../../src/component/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import VDomUpdate         from '../../../../src/manager/VDomUpdate.mjs';

class RaceChildComponent extends Component {
    static config = {
        className: 'Test.RaceChildComponent',
        ntype: 'test-race-child',
        _vdom: {tag: 'div', cls: ['child']}
    }
}
RaceChildComponent = Neo.setupClass(RaceChildComponent);

class RaceContainer extends Container {
    static config = {
        className: 'Test.RaceContainer',
        items: [{
            module: RaceChildComponent,
            id: 'child-1',
            hidden: true,
            text: 'Child 1'
        }, {
            module: RaceChildComponent,
            id: 'child-2',
            hidden: true,
            text: 'Child 2'
        }]
    }
}
RaceContainer = Neo.setupClass(RaceContainer);

test.describe('VdomLifecycle Race Condition', () => {

    test('Rapid visibility AND text changes should not duplicate nodes', async () => {
        // Mock applyDeltas to capture them
        const capturedDeltas = [];
        Neo.applyDeltas = async (appName, deltas) => {
            if (Array.isArray(deltas)) {
                capturedDeltas.push(...deltas);
            } else {
                capturedDeltas.push(deltas);
            }
        };

        const container = Neo.create(RaceContainer, {
            appName,
            id: 'test-container'
        });

        // 1. Initial Mount (Children are hidden)
        await container.initVnode(true);
        container.mounted = true;

        const child1 = container.items[0];
        const child2 = container.items[1];

        // Clear initial mount deltas
        capturedDeltas.length = 0;

        // 2. Trigger rapid updates (Hidden + Text)
        child1.set({hidden: false, text: 'Visible 1'});

        child2.set({hidden: false, text: 'Visible 2'});

        await container.promiseUpdate();
        await new Promise(resolve => setTimeout(resolve, 50));

        // Analyze Deltas
        const child2Inserts = capturedDeltas.filter(d =>
            d.action === 'insertNode' &&
            (d.id === 'child-2' || d.vnode?.id === 'child-2')
        );

        expect(child2Inserts.length).toBe(1);

        container.destroy();
    });
});
