import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import {isDescriptor} from '../../../../src/core/ConfigSymbols.mjs';

// Level 1
class BaseComponent extends Base {
    static config = {
        className    : 'Neo.Test.MultiLevel.BaseComponent',
        myConfig_    : 'baseValue',
        arrayConfig_ : {
            [isDescriptor]: true,
            value         : [1, 2],
            merge         : 'replace'
        },
        objectConfig_: {
            [isDescriptor]: true,
            value         : {a: 1, b: {c: 2}},
            merge         : 'deep'
        }
    }
}
BaseComponent = Neo.setupClass(BaseComponent);

// Level 2
class MidLevelComponent extends BaseComponent {
    static config = {
        className   : 'Neo.Test.MultiLevel.MidLevelComponent',
        arrayConfig : [3, 4],
        objectConfig: {b: {c: 3, d: 4}, e: 5}
    }
}
MidLevelComponent = Neo.setupClass(MidLevelComponent);

// Level 3
class TopLevelComponent extends MidLevelComponent {
    static config = {
        className   : 'Neo.Test.MultiLevel.TopLevelComponent',
        myConfig    : 'topValue',
        objectConfig: {b: {d: 99}, f: 6} // Override again
    }
}
TopLevelComponent = Neo.setupClass(TopLevelComponent);

/**
 * @summary Tests for config inheritance and merging in a multi-level hierarchy
 * This suite tests that configs are correctly inherited and merged through a three-level class hierarchy,
 * and that instance-level configs can override all class defaults.
 */
test.describe('Neo.core.Base#configs-multi-level-hierarchy', () => {
    test('Initial values for a three-level hierarchy instance', () => {
        const instance = Neo.create(TopLevelComponent);

        // myConfig is defined in Base, overridden in Top (Mid doesn't touch it)
        expect(instance.myConfig).toBe('topValue');

        // arrayConfig is defined in Base, overridden in Mid (Top doesn't touch it)
        expect(instance.arrayConfig).toEqual([3, 4]);

        // objectConfig is defined in Base, merged in Mid, and merged again in Top
        const expectedObject = {
            a: 1,             // from Base
            b: {c: 3, d: 99}, // c from Mid, d from Top
            e: 5,             // from Mid
            f: 6              // from Top
        };
        expect(instance.objectConfig).toEqual(expectedObject);
    });

    test('Instance-level config overrides on a three-level hierarchy', () => {
        const instance = Neo.create(TopLevelComponent, {
            myConfig    : 'instanceValue',
            arrayConfig : [10, 11],
            objectConfig: {a: 100, b: {c: 101}, g: 102}
        });

        expect(instance.myConfig).toBe('instanceValue');
        expect(instance.arrayConfig).toEqual([10, 11]);

        const expectedObject = {
            a: 100,             // from instance
            b: {c: 101, d: 99}, // c from instance, d from Top
            e: 5,               // from Mid
            f: 6,               // from Top
            g: 102              // from instance
        };

        expect(instance.objectConfig).toEqual(expectedObject);
    });
});
