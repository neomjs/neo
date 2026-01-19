import {setup} from '../../setup.mjs';

const appName = 'ReverseCollisionTest';

setup({
    neoConfig: {
        useDomApiRenderer: true,
        useVdomWorker    : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import VDomUpdate     from '../../../../src/manager/VDomUpdate.mjs';

class ReverseChildComponent extends Component {
    static config = {
        className: 'Test.ReverseChildComponent',
        ntype: 'test-reverse-child',
        _vdom: {tag: 'div', cls: ['child']}
    }
}
ReverseChildComponent = Neo.setupClass(ReverseChildComponent);

class ReverseContainer extends Container {
    static config = {
        className: 'Test.ReverseContainer',
        items: [{
            module: ReverseChildComponent,
            id: 'child-1'
        }]
    }
}
ReverseContainer = Neo.setupClass(ReverseContainer);

test.describe('VdomLifecycle Reverse Collision', () => {

    test('Parent should detect if Child is already updating', async () => {
        const container = Neo.create(ReverseContainer, {
            appName,
            id: 'test-container'
        });

        await container.initVnode(true);
        container.mounted = true;

        const child = container.items[0];

        // 1. Start Child Update (Simulate In-Flight)
        // We manually register it to simulate the race window
        VDomUpdate.registerInFlightUpdate(child.id, -1);
        child.isVdomUpdating = true;

        // 2. Trigger Parent Update (Depth -1 covers child)
        // This should normally check parents, but NOT children.
        // We want to prove it MISSES the child update.
        
        let childDetected = false;
        
        // We can inspect VDomUpdate state or hook into methods?
        // Let's rely on VDomUpdate logic.
        
        // If we implement hasInFlightDescendant, we can test THAT method directly first.
        
        const hasDescendant = VDomUpdate.hasInFlightDescendant(container.id, -1);
        
        console.log('Has In-Flight Descendant:', hasDescendant);
        
        expect(hasDescendant).toBe(true); 
        
        // Cleanup
        VDomUpdate.unregisterInFlightUpdate(child.id);
        container.destroy();
    });
});
