import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

class TestComponent extends core.Base {
    static config = {
        className    : 'Neo.Test.CustomFunctionsComponent',
        arrayConfig_ : {
            [isDescriptor]: true,
            value         : [1, 2],
            // NOTE: The custom merge function is called during two distinct phases:
            // 1. During Neo.setupClass(): To merge the static config down the inheritance chain.
            //    At this stage, `defaultValue` will be `undefined` if the config is defined for the
            //    first time in this class. The function must handle this case.
            // 2. During Neo.create(): To merge an instance-specific value into the class's final
            //    static default value.
            merge         : (defaultValue, instanceValue) => {
                // Custom merge: concatenate arrays. Handle the initial undefined case.
                return (defaultValue || []).concat(instanceValue);
            }
        },
        objectConfig_: {
            [isDescriptor]: true,
            value         : {id: 1, data: 'initial'},
            isEqual       : (a, b) => {
                // Custom isEqual: compare by id property
                return a?.id === b?.id;
            }
        }
    }
}
Neo.setupClass(TestComponent);

StartTest(t => {
    t.it('Custom "merge" function for array concatenation', t => {
        const instance = Neo.create(TestComponent, {
            arrayConfig: [3, 4]
        });

        // The custom merge function should concatenate the static default value [1, 2]
        // with the instance value [3, 4]
        t.isDeeplyStrict(instance.arrayConfig, [1, 2, 3, 4], 'Custom merge function should concatenate arrays');
    });

    t.it('Custom "isEqual" function for object comparison by id', t => {
        const instance = Neo.create(TestComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'objectConfig', () => {
            subscriberCalled++;
        });

        t.is(instance.objectConfig.data, 'initial', 'Initial object data is correct');

        // Set a new object with the SAME id. The custom isEqual should return true.
        instance.objectConfig = {id: 1, data: 'updated'};

        t.is(subscriberCalled, 0, 'Subscriber should NOT be called when id is the same');
        // The value should NOT have been updated because isEqual returned true
        t.is(instance.objectConfig.data, 'initial', 'Object data should not change when id is the same');


        // Set a new object with a DIFFERENT id. The custom isEqual should return false.
        instance.objectConfig = {id: 2, data: 'new object'};

        t.is(subscriberCalled, 1, 'Subscriber should be called when id is different');
        t.is(instance.objectConfig.data, 'new object', 'Object data should update when id is different');
    });
});
