import {setup} from '../../setup.mjs';

const appName = 'PrototypePollutionTest_DirectAccess';

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
import Component      from '../../../../src/component/Base.mjs';

test.describe('Neo.component.Base Direct _vdom Access Prototype Pollution', () => {

    test('Direct access to _vdom in afterSetId should NOT pollute prototype', async () => {
        // Define a component that accesses this._vdom DIRECTLY in afterSetId.
        // This bypasses the getter safeguard.
        class DirectAccessComponent extends Component {
            static config = {
                className: 'Test.DirectAccessComponent',
                ntype    : 'test-direct-access-component',
                _vdom: {
                    tag: 'div',
                    cls: ['test-class']
                }
            }

            afterSetId(value, oldValue) {
                super.afterSetId(value, oldValue);
                // DIRECT ACCESS to the private backing property.
                // This is the anti-pattern we want to guard against.
                this._vdom.id = value;
            }
        }

        const PollutedClass = Neo.setupClass(DirectAccessComponent);

        // 1. Create Instance 1
        const instance1 = Neo.create(PollutedClass, {
            appName,
            id: 'instance-direct-1'
        });

        expect(instance1.vdom.id).toBe('instance-direct-1');

        // 2. Create Instance 2
        const instance2 = Neo.create(PollutedClass, {
            appName,
            id: 'instance-direct-2'
        });

        expect(instance2.vdom.id).toBe('instance-direct-2');

        // 3. Verify Prototype Purity
        // If the safeguard works (e.g. eager cloning in construct),
        // the prototype should be clean.
        expect(PollutedClass.prototype._vdom.id).toBeUndefined();

        instance1.destroy();
        instance2.destroy();
    });
});
