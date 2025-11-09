import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

class TestComponent extends Base {
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
TestComponent = Neo.setupClass(TestComponent);

/**
 * @summary Tests for custom functions in Neo.core.Base config descriptors
 * This suite tests the behavior of custom `merge` and `isEqual` functions in config descriptors.
 */
test.describe('Neo.core.Base#configs-custom-functions', () => {
    test('Custom "merge" function for array concatenation', () => {
        const instance = Neo.create(TestComponent, {
            arrayConfig: [3, 4]
        });

        // The custom merge function should concatenate the static default value [1, 2]
        // with the instance value [3, 4]
        expect(instance.arrayConfig).toEqual([1, 2, 3, 4]);
    });

    test('Custom "isEqual" function for object comparison by id', () => {
        const instance = Neo.create(TestComponent);

        let subscriberCalled = 0;
        instance.observeConfig(instance, 'objectConfig', () => {
            subscriberCalled++;
        });

        expect(instance.objectConfig.data).toBe('initial');

        // Set a new object with the SAME id. The custom isEqual should return true.
        instance.objectConfig = {id: 1, data: 'updated'};

        expect(subscriberCalled).toBe(0);
        // The value should NOT have been updated because isEqual returned true
        expect(instance.objectConfig.data).toBe('initial');


        // Set a new object with a DIFFERENT id. The custom isEqual should return false.
        instance.objectConfig = {id: 2, data: 'new object'};

        expect(subscriberCalled).toBe(1);
        expect(instance.objectConfig.data).toBe('new object');
    });
});
