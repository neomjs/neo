import {setup} from '../../setup.mjs';

const appName = 'PrototypePollutionTest';

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
import * as core      from '../../../../src/core/_export.mjs'; // Ensure core is loaded
import Component      from '../../../../src/component/Base.mjs';

test.describe('Neo.component.Base Prototype Pollution', () => {

    test('Accessing vdom in afterSetId should not pollute prototype', async () => {
        // 1. Define a component that accesses this.vdom in afterSetId.
        // This pattern (accessing this.vdom before initConfig) mimics the dangerous pattern.
        class PollutionComponent extends Component {
            static config = {
                className: 'Test.PollutionComponent',
                ntype    : 'test-pollution-component',
                _vdom: {
                    tag: 'div',
                    cls: ['test-class']
                }
            }

            afterSetId(value, oldValue) {
                super.afterSetId(value, oldValue);
                // Accessing the getter here.
                // If lazy cloning is NOT implemented, this returns the prototype's _vdom
                // and we mutate it.
                this.vdom.id = value;
            }
        }

        // Register the class
        const PollutedClass = Neo.setupClass(PollutionComponent);

        // 2. Create Instance 1
        const instance1 = Neo.create(PollutedClass, {
            appName,
            id: 'instance-1'
        });

        // Verify Instance 1
        expect(instance1.vdom.id).toBe('instance-1');

        // 3. Create Instance 2
        const instance2 = Neo.create(PollutedClass, {
            appName,
            id: 'instance-2'
        });

        // Verify Instance 2
        expect(instance2.vdom.id).toBe('instance-2');

        // 4. Verify Prototype Purity
        // The class prototype's _vdom should NOT have an id.
        // If it does, the first instance polluted it.
        expect(PollutedClass.prototype._vdom.id).toBeUndefined();

        instance1.destroy();
        instance2.destroy();
    });
});
